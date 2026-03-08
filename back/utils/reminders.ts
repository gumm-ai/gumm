/**
 * Reminders — One-shot scheduled alerts triggered by the LLM.
 *
 * Uses `croner` for in-process scheduling (maxRuns: 1).
 * Persists to SQLite so reminders survive restarts.
 * Delivers via Telegram (sendMessage) or EventBus for web.
 */
import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { reminders } from '../db/schema';
import { telegramSendMessage, getTelegramToken } from './telegram';

/** Active one-shot cron jobs keyed by reminder ID */
const activeJobs = new Map<string, Cron>();

/**
 * Stop and clear all in-memory reminder jobs.
 * Does NOT touch the DB — caller is responsible for that.
 */
export function clearAllReminderJobs() {
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();
}

export interface CreateReminderOpts {
  message: string;
  triggerAt: Date;
  channel: 'telegram' | 'web';
  chatId?: number;
  conversationId?: string;
}

/**
 * Schedule a new reminder. Persists to DB and starts a croner one-shot.
 */
export async function createReminder(
  opts: CreateReminderOpts,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();

  await useDrizzle()
    .insert(reminders)
    .values({
      id,
      message: opts.message,
      triggerAt: opts.triggerAt,
      channel: opts.channel,
      chatId: opts.chatId ?? null,
      conversationId: opts.conversationId ?? null,
      fired: false,
      createdAt: now,
    });

  scheduleJob(id, opts.message, opts.triggerAt);

  console.log(
    `[Reminders] Created: "${opts.message}" → ${opts.triggerAt.toISOString()} (${opts.channel})`,
  );

  return id;
}

/**
 * Cancel a pending reminder.
 */
export async function cancelReminder(id: string): Promise<boolean> {
  const job = activeJobs.get(id);
  if (job) {
    job.stop();
    activeJobs.delete(id);
  }

  const result = await useDrizzle()
    .delete(reminders)
    .where(eq(reminders.id, id));

  return true;
}

/**
 * List all pending (not yet fired) reminders.
 */
export async function listActiveReminders() {
  return useDrizzle()
    .select()
    .from(reminders)
    .where(eq(reminders.fired, false));
}

/**
 * Restore pending reminders from DB on boot.
 * Called during Brain init so reminders survive restarts.
 */
export async function restoreReminders() {
  try {
    const rows = await useDrizzle()
      .select()
      .from(reminders)
      .where(eq(reminders.fired, false));

    for (const row of rows) {
      scheduleJob(row.id, row.message, row.triggerAt);
    }

    if (rows.length > 0) {
      console.log(`[Reminders] Restored ${rows.length} pending reminder(s)`);
    }
  } catch (err: any) {
    console.warn('[Reminders] Could not restore reminders:', err.message);
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

function scheduleJob(id: string, message: string, triggerAt: Date) {
  const now = new Date();

  if (triggerAt <= now) {
    // Already past — fire immediately
    fireReminder(id).catch((err) =>
      console.error(`[Reminders] Fire failed for ${id}:`, err.message),
    );
    return;
  }

  const job = new Cron(triggerAt, { maxRuns: 1 }, async () => {
    await fireReminder(id);
  });

  activeJobs.set(id, job);
}

async function fireReminder(id: string) {
  const [row] = await useDrizzle()
    .select()
    .from(reminders)
    .where(eq(reminders.id, id))
    .limit(1);

  if (!row || row.fired) return;

  // Mark as fired
  await useDrizzle()
    .update(reminders)
    .set({ fired: true })
    .where(eq(reminders.id, id));

  activeJobs.delete(id);

  // Deliver via Telegram
  if (row.channel === 'telegram' && row.chatId) {
    const token = await getTelegramToken();
    if (token) {
      try {
        await telegramSendMessage(
          token,
          row.chatId,
          `⏰ **Rappel** : ${row.message}`,
        );
      } catch (err: any) {
        console.error('[Reminders] Telegram send failed:', err.message);
      }
    }
  }

  // Emit event (for web clients / SSE)
  try {
    const brain = useBrain();
    await brain.events.emit('brain', 'reminder.fired', {
      reminderId: id,
      message: row.message,
      channel: row.channel,
      chatId: row.chatId,
      conversationId: row.conversationId,
    });
  } catch {
    // EventBus may not be ready
  }

  console.log(`[Reminders] ⏰ Fired: "${row.message}" (${row.channel})`);
}
