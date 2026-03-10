/**
 * Builtin Commands Plugin — seeds official /commands on startup.
 *
 * Inserts system-level slash commands with moduleId='system'.
 * These commands map to core built-in capabilities and cannot be deleted.
 * They are upserted on every startup so new commands are added automatically.
 */
import { eq } from 'drizzle-orm';
import { commands } from '../db/schema';
import { syncCommandsWithTelegram } from '../utils/telegram';

interface BuiltinCommand {
  name: string;
  shortDescription: string;
  description: string;
}

const BUILTIN_COMMANDS: BuiltinCommand[] = [
  // ── Jobs ────────────────────────────────────────────────────────────
  {
    name: 'addjob',
    shortDescription: 'Launch a background job (server or remote machine)',
    description:
      "Create and start a background job. Determine WHERE to run it:\n\n1. If the task requires local machine capabilities (file system, apps, shell commands, local automations like fswatch/launchd, etc.) OR the user mentions a machine name — use execute_on_cli, not spawn_background_task. For local machine tasks: first call list_devices to discover available machines, match the user's requested machine by name (case-insensitive), then call execute_on_cli with the matching device_id. If only one device exists, use it automatically. Write a COMPLETE self-contained prompt with all commands, scripts, and file contents pre-written — never leave the agent to figure out the approach.\n\n2. If the task is server-side (research, data processing, API calls, analysis) — use spawn_background_task.\n\nFor the title: if the user provides a short sentence, use it as-is. If long, extract a concise title. Confirm the job was dispatched and where it will run.\n\nCRITICAL for persistent macOS file watchers / daemons: In the prompt you write for execute_on_cli, ALWAYS (a) use launchd (NOT nohup or &), (b) write all logs to /tmp/ and NEVER inside the monitored folder (log files in the watched folder cause infinite loops), (c) filter the watcher by file extension so it ignores log/temp files, (d) use a specific launchd label like com.gumm.<task-name> so health checks can find it.",
  },
  {
    name: 'jobs',
    shortDescription: 'List current background jobs',
    description:
      'Show the status of all background jobs. List running jobs first, then completed/failed ones. For each job show: title, status (running/done/failed/cancelled), duration, and number of iterations. If a job failed, show the error. Keep the output concise and formatted as a clean list.',
  },
  // ── Memory ──────────────────────────────────────────────────────────
  {
    name: 'remember',
    shortDescription: 'Save something to long-term memory',
    description:
      'Use the memory_remember tool to store the information provided by the user. If the user says "/remember X", save X as a memory. Confirm what was saved. If no input is provided, ask the user what they want to remember.',
  },
  {
    name: 'recall',
    shortDescription: 'Search your memory',
    description:
      'Use the memory_recall tool to search for memories matching the user input. If no query is provided, use memory_recall_all to list all memories. Present the results clearly. If nothing is found, let the user know.',
  },
  {
    name: 'forget',
    shortDescription: 'Delete a memory',
    description:
      'Use the memory_forget tool to delete the memory specified by the user. If the input is vague, first use memory_recall to find matching memories, show them, and ask which one to delete. Confirm deletion.',
  },
  // ── Reminders ───────────────────────────────────────────────────────
  {
    name: 'remind',
    shortDescription: 'Set a reminder',
    description:
      'Use the schedule_reminder tool to create a reminder. Parse the user input for: what to remind and when. Accept natural language like "in 30 minutes", "tomorrow at 9am", "next Monday". If the time or message is unclear, ask for clarification. Confirm the reminder with the scheduled time.',
  },
  {
    name: 'reminders',
    shortDescription: 'List active reminders',
    description:
      'Use the list_reminders tool to show all active (pending) reminders. Display each reminder with its message, scheduled time, and ID. If none exist, say so.',
  },
  // ── Recurring Tasks ─────────────────────────────────────────────────
  {
    name: 'repeat',
    shortDescription: 'Create a recurring task',
    description:
      'Use the create_recurring_task tool to set up a task that runs on a schedule. Parse the user input for: task name, what to do, and the schedule (cron expression or natural language like "every day at 9am", "every Monday", "every hour"). If the cron expression is complex, infer it from the natural language. Confirm with the next scheduled run time.',
  },
  {
    name: 'recurring',
    shortDescription: 'List recurring tasks',
    description:
      'Use the list_recurring_tasks tool to show all active recurring tasks. Display each with: name, cron schedule, last run, next run, and status. If none exist, say so.',
  },
  // ── Knowledge ───────────────────────────────────────────────────────
  {
    name: 'learn',
    shortDescription: 'Save knowledge to the brain',
    description:
      'Use the brain_save_knowledge tool to store knowledge. The user provides a topic and content. If the user just gives a blob of text, infer a good title/category. Categories: general, technical, personal, work, health, finance, hobby. Confirm what was saved.',
  },
  {
    name: 'knowledge',
    shortDescription: 'List stored knowledge',
    description:
      'Use the brain_list_knowledge tool to list all knowledge entries. You can filter by category if the user specifies one. Display each entry with title, category, and a preview of the content.',
  },
  // ── Personal Facts ──────────────────────────────────────────────────
  {
    name: 'fact',
    shortDescription: 'Save a personal fact about the user',
    description:
      'Use the personal_fact_save tool to store a personal fact. Parse the user input to extract the fact, category (identity, preference, routine, health, work, relationship, interest, goal), and an appropriate label. If the input is just a sentence, infer the category. Confirm what was saved.',
  },
  {
    name: 'facts',
    shortDescription: 'List personal facts',
    description:
      'Use the personal_fact_list tool to show all stored personal facts about the user. You can filter by category if specified. Display them grouped by category for clarity.',
  },
  // ── Secrets ─────────────────────────────────────────────────────────
  {
    name: 'secret',
    shortDescription: 'Save a secret securely',
    description:
      'Use the save_secret tool to securely store a key-value secret. Parse the user input for a key name and value (e.g. "/secret github_token abc123"). If the format is unclear, ask the user for the key and value. Never display the secret value back. Confirm it was saved.',
  },
  {
    name: 'secrets',
    shortDescription: 'List stored secrets',
    description:
      'Use the list_secrets tool to list all stored secret keys (names only, never show values). Display them as a clean list. If none exist, say so.',
  },
  // ── Fetch ───────────────────────────────────────────────────────────
  {
    name: 'fetch',
    shortDescription: 'Fetch and read a URL',
    description:
      'Use the fetch_url tool to fetch the content of the URL provided by the user. Display a summary of the page content. If no URL is provided, ask for one. Handle errors gracefully (invalid URL, timeout, etc.).',
  },
  // ── CLI Delegation ──────────────────────────────────────────────────
  {
    name: 'pc',
    shortDescription: 'Run a task on your local PC',
    description:
      "Use the execute_on_cli tool to delegate a task to the user's local computer. The user describes what they want done on their PC — opening apps, running commands, managing files, browsing, screenshots, etc. Be thorough in the prompt you send to the CLI agent. If the user is vague, ask for specifics. Confirm the task was delegated.",
  },
  // ── Help ────────────────────────────────────────────────────────────
  {
    name: 'help',
    shortDescription: 'Show available commands',
    description:
      'List all available slash commands with their short descriptions. Group them by category: Jobs, Memory, Reminders, Recurring Tasks, Knowledge, Personal Facts, Secrets, Utilities. Format as a clean, readable list. Also mention that modules can add their own commands.',
  },
];

export default defineNitroPlugin(async () => {
  // Small delay to let DB initialize
  setTimeout(async () => {
    try {
      await ensureBuiltinCommands();
      await syncCommandsWithTelegram();
    } catch (err: any) {
      console.warn('[BuiltinCommands] Failed to seed commands:', err.message);
    }
  }, 3000);
});

async function ensureBuiltinCommands() {
  const db = useDrizzle();

  for (const cmd of BUILTIN_COMMANDS) {
    const [existing] = await db
      .select()
      .from(commands)
      .where(eq(commands.name, cmd.name))
      .limit(1);

    if (existing) {
      // Only update system commands (don't overwrite user-created ones with same name)
      if (existing.moduleId === 'system') {
        await db
          .update(commands)
          .set({
            shortDescription: cmd.shortDescription,
            description: cmd.description,
            updatedAt: new Date(),
          })
          .where(eq(commands.id, existing.id));
      }
    } else {
      await db.insert(commands).values({
        id: crypto.randomUUID(),
        name: cmd.name,
        shortDescription: cmd.shortDescription,
        description: cmd.description,
        moduleId: 'system',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  console.log(
    `[BuiltinCommands] ${BUILTIN_COMMANDS.length} system commands synced.`,
  );
}
