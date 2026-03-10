/**
 * Built-in tools available to the LLM regardless of user modules.
 *
 * Provides memory persistence so the LLM can actually remember and recall
 * facts across conversations and channels (web, Telegram, etc.).
 * Also provides reminder scheduling (one-shot alerts via Telegram or web).
 */
import type { ToolDefinition } from './module-types';
import { remember, recall, recallAll, forget } from './memory';
import {
  createReminder,
  listActiveReminders,
  cancelReminder,
} from './reminders';
import {
  createRecurringTask,
  listRecurringTasks,
  cancelRecurringTask,
} from './recurring-tasks';
import { storageGet, storageList, storageInfo } from './storage';
import { createAgentTask } from './agent-tasks';
import { spawnBackgroundJob } from './background-jobs';
import {
  telegramSendMessage,
  telegramSendPhoto,
  telegramSendDocument,
  getTelegramToken,
  getTelegramAllowedChats,
} from './telegram';
import {
  savePersonalFact,
  getPersonalFacts,
  deletePersonalFact,
  type PersonalFactCategory,
} from './personal-facts';
import { saveSecret, getSecret, listSecrets, deleteSecret } from './secrets';
import { devices } from '../db/schema';
import {
  saveKnowledge,
  listKnowledge,
  deleteKnowledge,
  type KnowledgeCategory,
} from './brain-knowledge';

/**
 * Channel context passed through from the chat pipeline so built-in tools
 * know where to deliver async actions (e.g. reminders).
 */
export interface ChannelContext {
  channel: 'telegram' | 'web';
  chatId?: number; // Telegram chat ID
  conversationId?: string;
}

const BRAIN_NAMESPACE = 'brain';

/** Tool definitions injected into every LLM call. */
export function getBuiltinTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'memory_remember',
        description:
          'Save a piece of information to long-term memory so you can recall it later. Use this whenever the user asks you to remember something, or when you detect important facts worth persisting (lists, preferences, dates, names, etc.).',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'A short, descriptive key for the memory (e.g. "grocery_list", "user_birthday", "preferred_language").',
            },
            value: {
              type: 'string',
              description: 'The content to remember.',
            },
            type: {
              type: 'string',
              enum: ['fact', 'preference', 'context', 'event'],
              description: 'The type of memory. Default: "fact".',
            },
          },
          required: ['key', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_recall',
        description:
          'Retrieve a specific memory entry by its key. Use this when the user asks about something you previously saved.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to recall.',
            },
          },
          required: ['key'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_recall_all',
        description:
          'List all memories stored in the brain namespace. Use this when you need to find relevant memories or when the user asks what you remember.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_forget',
        description:
          'Delete a memory entry by its key. Use this when the user asks you to forget something.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key of the memory to delete.',
            },
          },
          required: ['key'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'schedule_reminder',
        description:
          'Schedule a reminder that will be delivered later. Use this when the user asks you to remind them of something in X minutes/hours, or at a specific time. The reminder will be sent automatically when the time comes.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description:
                'The reminder message to deliver (e.g. "Check the oven", "Call the dentist").',
            },
            delay_minutes: {
              type: 'number',
              description:
                'Number of minutes from now to trigger the reminder. Use this for relative times like "in 5 minutes", "in 1 hour" (60), "in 30 seconds" (0.5).',
            },
          },
          required: ['message', 'delay_minutes'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_reminders',
        description:
          'List all pending (not yet fired) reminders. Use when the user asks about their active reminders.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_reminder',
        description:
          'Cancel a pending reminder by its ID. Use when the user wants to cancel a specific reminder.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the reminder to cancel.',
            },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_attachments',
        description:
          'List all files stored in Gumm storage (attachments received from Telegram, Gmail, etc.). Returns storageKeys that can be used with gmail_send_email or send_telegram_file.',
        parameters: {
          type: 'object',
          properties: {
            prefix: {
              type: 'string',
              description:
                'Optional prefix to filter results (e.g. "attachments/telegram", "attachments/gmail"). Defaults to "attachments".',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_telegram_message',
        description:
          'Send a text message to Telegram. Works from any channel (web, CLI, etc.) — not limited to Telegram conversations. Use this when the user asks you to send something to Telegram from the CLI or web interface. Requires Telegram to be configured with at least one allowed chat ID.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message text to send.',
            },
            chatId: {
              type: 'number',
              description:
                'Optional Telegram chat ID. If omitted, sends to the first allowed chat ID configured in settings.',
            },
          },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_telegram_file',
        description:
          'Send a file from Gumm storage to the current Telegram chat. Use this when the user asks you to send/forward an image, document, or any file that was previously received and stored. Images (jpg, png, gif, webp) are sent as photos; other files as documents.',
        parameters: {
          type: 'object',
          properties: {
            storageKey: {
              type: 'string',
              description:
                'The storageKey of the file to send (from list_attachments or a previous attachment notification).',
            },
            caption: {
              type: 'string',
              description: 'Optional caption to send with the file.',
            },
          },
          required: ['storageKey'],
        },
      },
    },
    // ── Personal Facts ─────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'personal_fact_save',
        description:
          'Save a personal fact about your owner/master. Use this PROACTIVELY whenever you detect personal information in the conversation: name, age, gender, food preferences, music tastes, clothing style, hobbies, dislikes, allergies, relationships, job, etc. Also use this when the user explicitly tells you something about themselves. This builds a permanent profile so you can personalize all interactions.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'identity',
                'preferences',
                'tastes',
                'dislikes',
                'health',
                'lifestyle',
                'relationships',
                'work',
                'other',
              ],
              description:
                'The category of the fact. identity = name/age/gender/pronouns. preferences = general preferences. tastes = things they like (food, music, fashion, etc.). dislikes = things they dislike or hate. health = allergies, conditions, diet. lifestyle = habits, routines. relationships = family, friends, pets. work = job, career, skills.',
            },
            key: {
              type: 'string',
              description:
                'A short, descriptive key in snake_case (e.g. "first_name", "hates_broccoli", "favorite_music_genre", "clothing_style").',
            },
            value: {
              type: 'string',
              description:
                'The personal information to store (e.g. "Florian", "Detests broccoli in all forms", "Loves electronic music, especially techno").',
            },
          },
          required: ['category', 'key', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'personal_fact_list',
        description:
          'List all known personal facts about your owner, optionally filtered by category. Use this when you need to check what you already know before saving duplicates, or when the user asks what you know about them.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'identity',
                'preferences',
                'tastes',
                'dislikes',
                'health',
                'lifestyle',
                'relationships',
                'work',
                'other',
              ],
              description: 'Optional category filter.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'personal_fact_delete',
        description:
          'Delete a personal fact by its ID. Use when the user says something is no longer true or asks you to forget a personal detail.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the personal fact to delete.',
            },
          },
          required: ['id'],
        },
      },
    },
    // ── Secrets Vault (local credential storage) ────────────────────────
    {
      type: 'function',
      function: {
        name: 'save_secret',
        description:
          "Save a sensitive credential (username, password, API key, token, etc.) to the local secure vault. Use this PROACTIVELY when the user shares credentials, login info, or any sensitive data — especially after detecting [REDACTED] markers in the conversation (which means the user used [[double brackets]] to protect the value). Passwords and sensitive tokens should have is_password=true so they are hashed. IMPORTANT: The actual secret values were stripped from the message before reaching you. The user's original message contained [[secret]] markers that were replaced with [REDACTED]. You will receive the extracted values in a special system note. Use those values when calling this tool.",
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description:
                'The service or platform name (e.g. "netflix", "github", "wifi-home", "bank-xyz").',
            },
            key: {
              type: 'string',
              description:
                'The credential key (e.g. "username", "password", "email", "api_key", "token").',
            },
            value: {
              type: 'string',
              description: 'The actual secret value to store.',
            },
            is_password: {
              type: 'boolean',
              description:
                'Set to true for passwords, tokens, and highly sensitive values. These will be hashed+salted and cannot be retrieved in plaintext. Default: false.',
            },
          },
          required: ['service', 'key', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_secret',
        description:
          'Retrieve a stored credential by service and key. Passwords return a masked placeholder (they are hashed and cannot be read back). Non-password values (usernames, emails, etc.) are returned in plaintext.',
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: 'The service name.',
            },
            key: {
              type: 'string',
              description: 'The credential key.',
            },
          },
          required: ['service', 'key'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_secrets',
        description:
          'List all stored credentials, optionally filtered by service. Passwords are masked. Use this when the user asks what credentials you have stored.',
        parameters: {
          type: 'object',
          properties: {
            service: {
              type: 'string',
              description: 'Optional service name to filter by.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_secret',
        description:
          'Delete a stored credential by its ID. Use when the user wants to remove a saved credential.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the secret to delete.',
            },
          },
          required: ['id'],
        },
      },
    },
    // ── Background Jobs (multi-agent parallel tasks) ────────────────────
    {
      type: 'function',
      function: {
        name: 'spawn_background_task',
        description:
          'Spawn an independent background task that runs in parallel without blocking the current conversation. Use this when the user asks you to do multiple things at once, or for long-running work (research, multi-step analysis, complex automations) that should not tie up the chat. Each task gets its own AI loop with full tool access. The user can monitor tasks in the Jobs dashboard. Examples: "research X while we talk about Y", "do all of these things simultaneously", "run that in the background".',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description:
                'A short, descriptive title for this task (e.g. "Research best React patterns", "Compile weekly report"). Shown in the Jobs UI.',
            },
            prompt: {
              type: 'string',
              description:
                'The full, detailed instruction for the background agent. Be thorough — include all context, goals, and expected output format. The agent will use this as its task description.',
            },
          },
          required: ['title', 'prompt'],
        },
      },
    },
    // ── List Devices ────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'list_devices',
        description:
          'List all registered CLI devices (machines running `gumm up`). Use this to discover available machines before targeting one with execute_on_cli. Returns device ID, name, OS, status (online/offline), and last seen time.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    // ── CLI Agent Task (delegate to user's PC) ──────────────────────────
    {
      type: 'function',
      function: {
        name: 'execute_on_cli',
        description:
          "Delegate a task to the user's local PC for execution. Use this when the user asks you to do something that requires their physical computer: open apps, run commands, take screenshots, manage local files, browse the web locally, etc. The task will be picked up by the CLI agent running on their machine (`gumm up`). The result will be sent back to the current channel (Telegram or web).\n\nIMPORTANT: Use this only when the action genuinely requires the user's local machine. For server-side actions (memory, reminders, modules), use the normal tools.\n\nIMPORTANT: The prompt you write MUST contain ONLY the current user request. Do NOT include tasks from previous conversation turns that have already been completed. Each execute_on_cli call is a fresh, isolated task — the CLI agent has NO memory of prior tasks.\n\nIMPORTANT for complex tasks: Write a COMPLETE, step-by-step prompt with ALL commands and file contents pre-written. Do NOT leave the CLI agent to figure out the approach — give it the exact shell commands, exact file contents, and exact paths.\n\nIMPORTANT for persistent macOS daemons / file watchers: ALWAYS use launchd (NOT nohup, disown, or &). Write the full plist XML and install it with launchctl. This survives reboots and guaranteed not to die. CRITICAL rules for watchers: (1) Write all logs to /tmp/ — NEVER write log files inside the monitored folder; log files in the watched folder will trigger the watcher again, creating an infinite loop. (2) Filter strictly by file extension in the watcher command (e.g. fswatch --include='\\.jpg$|.png$|.jpeg$|.tiff$' --exclude='.*'). (3) Give the launchd label a specific unique name (e.g. com.gumm.image-watcher) so health checks can identify it with 'launchctl list | grep com.gumm'.\n\nIMPORTANT for file searches: Be thorough in the prompt you delegate. If the user asks for a generic term (e.g. 'pokemon'), also include related terms, character names, and variations. Use case-insensitive search and broad patterns.\n\nIMPORTANT for sending files: The CLI agent can upload local files to storage using upload_file, then send them to Telegram via send_telegram_file. Tell the agent to find, upload, AND send the file in a single task.",
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                "A detailed, self-contained instruction describing what needs to be done on the user's computer. ONLY include the current task — never add actions from previous conversation turns. Be VERY specific: include app names, file paths, URLs, exact commands, and full file contents when writing files. For complex tasks (setup scripts, automations, config files), write out the COMPLETE content of every file and the exact commands to run — do NOT tell the agent to 'figure it out'. The CLI agent will interpret this and use its local tools (open_url, open_application, run_shell_command, take_screenshot, read_file, write_file, list_directory, upload_file). For file searches, include multiple search terms and variations. For sending files to Telegram, instruct the agent to: 1) find the file, 2) upload it with upload_file, 3) send it with send_telegram_file using the returned storageKey.\n\nIMPORTANT for browser tasks: Before delegating a browser task, call memory_recall(key: 'preferred_browser') to check if the user has a saved browser preference. If set, include it in the prompt: 'Use <browser> for this task (open URLs with open_url browser parameter set to <browser>, and pass browser=<browser> to get_browser_dom, click_browser_element, type_in_browser, and scroll_browser)'. If NOT set, include in the prompt: 'FIRST call detect_browsers and ask the user which browser they prefer, save it with memory_remember(key: preferred_browser), then proceed.'\n\nIMPORTANT for browser interaction: Instruct the CLI agent to use get_browser_dom + click_browser_element + type_in_browser for interacting with web pages. These are JavaScript-based and MUCH more reliable than screenshot + click_at. The agent must pass the browser name to ALL browser tools (get_browser_dom, click_browser_element, type_in_browser, scroll_browser) to avoid targeting the wrong browser.",
            },
            device_id: {
              type: 'string',
              description:
                'Optional. The ID of a specific device to target (from list_devices). If omitted, the task is sent to any connected CLI agent. Use list_devices first to find the right device ID when the user specifies a machine.',
            },
          },
          required: ['prompt'],
        },
      },
    },
    // ── Recurring Tasks (Cron-based autonomous actions) ──────────────────
    {
      type: 'function',
      function: {
        name: 'create_recurring_task',
        description:
          'Create a recurring scheduled task that runs autonomously on a cron schedule. Use this when the user asks for something recurring like "give me the weather every morning", "send me a summary every Friday", etc. The task will execute autonomously: you (the AI) will be called with the prompt, can use tools (weather, memory, etc.), and the result will be sent to the user automatically. Common cron patterns: "0 7 * * *" = every day at 7:00, "0 8 * * 1" = every Monday at 8:00, "0 */6 * * *" = every 6 hours, "30 12 * * 1-5" = weekdays at 12:30.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description:
                'A short, descriptive name for the task (e.g. "daily-weather-briefing", "weekly-summary").',
            },
            prompt: {
              type: 'string',
              description:
                'The instruction that will be executed each time the task runs. Be specific and include all context needed (e.g. "Give the current weather forecast for Guillestre, France. Include temperature, conditions, and any alerts. Be concise.").',
            },
            cron: {
              type: 'string',
              description:
                'A cron expression defining when the task runs (croner syntax, 5 fields: minute hour day-of-month month day-of-week). Examples: "0 7 * * *" (daily at 7am), "0 8 * * 1-5" (weekdays at 8am), "0 */4 * * *" (every 4 hours).',
            },
          },
          required: ['name', 'prompt', 'cron'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_recurring_tasks',
        description:
          'List all recurring tasks (active and disabled). Use when the user asks about their scheduled tasks or automations.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_recurring_task',
        description:
          'Cancel and delete a recurring task by its ID. Use when the user wants to stop a scheduled automation.',
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the recurring task to cancel.',
            },
          },
          required: ['id'],
        },
      },
    },
    // ── Brain Knowledge (self-evolving knowledge base) ──────────────────
    {
      type: 'function',
      function: {
        name: 'brain_save_knowledge',
        description:
          "Save or update a piece of knowledge to your permanent knowledge base. Use this PROACTIVELY when you learn something valuable that should persist: procedures you figured out, corrections the user made, insights from conversations, useful sources/links, or project context. This builds your evolving brain — future conversations will benefit from this knowledge. Examples: How to deploy something, user corrections about preferences, patterns you've noticed, documentation links, current project details.",
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'procedures',
                'insights',
                'projects',
                'sources',
                'corrections',
              ],
              description:
                'The category for this knowledge. procedures = how-to guides, step-by-step processes. insights = patterns observed, lessons learned, tips. projects = context about ongoing projects/tasks. sources = useful links, documentation, references. corrections = things the user corrected you on.',
            },
            slug: {
              type: 'string',
              description:
                'A short, URL-safe identifier for this knowledge entry (e.g. "deploy-docker", "user-prefers-french", "gumm-architecture"). Use lowercase with hyphens.',
            },
            title: {
              type: 'string',
              description: 'A human-readable title for this knowledge entry.',
            },
            content: {
              type: 'string',
              description:
                'The knowledge content in Markdown format. Be concise but complete. Include relevant details, steps, or context that would be useful in future conversations.',
            },
          },
          required: ['category', 'slug', 'title', 'content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'brain_list_knowledge',
        description:
          'List all entries in your knowledge base, optionally filtered by category. Use this to check what you already know before adding duplicates, or when curious about your accumulated knowledge.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'procedures',
                'insights',
                'projects',
                'sources',
                'corrections',
              ],
              description: 'Optional category filter.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'brain_delete_knowledge',
        description:
          'Delete a knowledge entry that is outdated, incorrect, or no longer relevant. Use when information needs to be removed from your brain.',
        parameters: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'procedures',
                'insights',
                'projects',
                'sources',
                'corrections',
              ],
              description: 'The category of the knowledge to delete.',
            },
            slug: {
              type: 'string',
              description:
                'The slug identifier of the knowledge entry to delete.',
            },
          },
          required: ['category', 'slug'],
        },
      },
    },
    // ── Web fetch ───────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'fetch_url',
        description:
          'Fetch the text content of a public web URL. ALWAYS use this tool when the user shares a link and you need to read its content — never rely on training data instead. Works for medical pages, news articles, documentation, Wikipedia, etc.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'The full URL to fetch (must start with http:// or https://).',
            },
          },
          required: ['url'],
        },
      },
    },
  ];
}

/**
 * Execute a built-in tool call. Returns null if the tool name doesn't match.
 * @param channelCtx — Where the chat is happening (Telegram/web) so async
 *   actions like reminders know where to deliver.
 */
export async function executeBuiltinTool(
  toolName: string,
  args: Record<string, any>,
  channelCtx?: ChannelContext,
): Promise<string | null> {
  switch (toolName) {
    case 'memory_remember': {
      await remember(
        BRAIN_NAMESPACE,
        args.key,
        args.value,
        args.type || 'fact',
      );
      return `Remembered "${args.key}" successfully.`;
    }
    case 'memory_recall': {
      const value = await recall(BRAIN_NAMESPACE, args.key);
      if (value === null) return `No memory found for key "${args.key}".`;
      return typeof value === 'string' ? value : JSON.stringify(value);
    }
    case 'memory_recall_all': {
      const entries = await recallAll(BRAIN_NAMESPACE);
      if (entries.length === 0) return 'No memories stored yet.';
      return entries
        .map((e) => {
          const val =
            typeof e.value === 'string' ? e.value : JSON.stringify(e.value);
          return `- ${e.key}: ${val}`;
        })
        .join('\n');
    }
    case 'memory_forget': {
      await forget(BRAIN_NAMESPACE, args.key);
      return `Forgot "${args.key}" successfully.`;
    }
    case 'schedule_reminder': {
      const delayMs = (args.delay_minutes ?? 1) * 60 * 1000;
      const triggerAt = new Date(Date.now() + delayMs);

      const id = await createReminder({
        message: args.message,
        triggerAt,
        channel: channelCtx?.channel || 'web',
        chatId: channelCtx?.chatId,
        conversationId: channelCtx?.conversationId,
      });

      const timeStr = triggerAt.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Reminder scheduled for ${timeStr} (id: ${id}).`;
    }
    case 'list_reminders': {
      const pending = await listActiveReminders();
      if (pending.length === 0) return 'No pending reminders.';
      return pending
        .map((r) => {
          const when = new Date(r.triggerAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return `- [${r.id}] "${r.message}" → ${when} (${r.channel})`;
        })
        .join('\n');
    }
    case 'cancel_reminder': {
      await cancelReminder(args.id);
      return `Reminder ${args.id} cancelled.`;
    }
    case 'list_attachments': {
      const prefix = args.prefix || 'attachments';
      const files = await storageList(prefix);
      if (files.length === 0) return 'No attachments stored.';
      const lines = await Promise.all(
        files.map(async (f) => {
          const info = await storageInfo(f);
          const sizeKb = info ? Math.round(info.size / 1024) : '?';
          return `- ${f} (${sizeKb} KB)`;
        }),
      );
      return `Stored files (${files.length}):\n${lines.join('\n')}`;
    }
    case 'send_telegram_message': {
      const token = await getTelegramToken();
      if (!token) return 'Error: Telegram bot token not configured.';

      let targetChatId = args.chatId;
      if (!targetChatId) {
        // Use current channel chatId if in Telegram, else first allowed chat
        if (channelCtx?.channel === 'telegram' && channelCtx.chatId) {
          targetChatId = channelCtx.chatId;
        } else {
          const allowed = await getTelegramAllowedChats();
          if (allowed.length === 0)
            return 'Error: No Telegram chat IDs configured. Set allowed chat IDs in Telegram settings.';
          targetChatId = allowed[0];
        }
      }

      await telegramSendMessage(token, targetChatId, args.message);
      return `Message sent to Telegram chat ${targetChatId} successfully.`;
    }
    case 'send_telegram_file': {
      const { storageKey, caption } = args;
      if (!storageKey) return 'Error: storageKey is required.';

      const token = await getTelegramToken();
      if (!token) return 'Error: Telegram bot token not configured.';

      // Resolve target chat ID: current Telegram context, explicit arg, or first allowed chat
      let fileChatId: number | undefined;
      if (channelCtx?.channel === 'telegram' && channelCtx.chatId) {
        fileChatId = channelCtx.chatId;
      } else {
        const allowed = await getTelegramAllowedChats();
        if (allowed.length > 0) fileChatId = allowed[0];
      }
      if (!fileChatId)
        return 'Error: No Telegram chat ID available. Configure allowed chat IDs or use from a Telegram conversation.';

      const fileData = await storageGet(storageKey);
      if (!fileData) return `Error: File not found in storage: ${storageKey}`;

      const filename = storageKey.split('/').pop() || 'file';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

      if (imageExts.includes(ext)) {
        await telegramSendPhoto(token, fileChatId, fileData, filename, caption);
      } else {
        await telegramSendDocument(
          token,
          fileChatId,
          fileData,
          filename,
          caption,
        );
      }

      return `File "${filename}" sent to Telegram chat successfully.`;
    }
    // ── Personal Facts ────────────────────────────────────────────────
    case 'personal_fact_save': {
      const category = (args.category || 'other') as PersonalFactCategory;
      const fact = await savePersonalFact(
        category,
        args.key,
        args.value,
        'auto',
      );
      return `Personal fact saved: [${category}] ${args.key} = "${args.value}" (id: ${fact.id})`;
    }
    case 'personal_fact_list': {
      const facts = await getPersonalFacts(
        args.category as PersonalFactCategory | undefined,
      );
      if (facts.length === 0) return 'No personal facts recorded yet.';
      return facts
        .map((f) => `- [${f.id}] (${f.category}) ${f.key}: ${f.value}`)
        .join('\n');
    }
    case 'personal_fact_delete': {
      await deletePersonalFact(args.id);
      return `Personal fact ${args.id} deleted.`;
    }
    // ── Background Jobs ───────────────────────────────────────────────
    case 'spawn_background_task': {
      const jobId = await spawnBackgroundJob({
        title: args.title,
        prompt: args.prompt,
        parentConversationId: channelCtx?.conversationId,
      });
      return `Background task spawned (id: ${jobId}). Title: "${args.title}". The task is now running independently. The user can monitor it in the Jobs dashboard.`;
    }
    // ── List Devices ──────────────────────────────────────────────────
    case 'list_devices': {
      const rows = await useDrizzle().select().from(devices);
      const now = Date.now();
      const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;
      if (rows.length === 0)
        return 'No devices registered. The user needs to run `gumm up` on their machine.';
      return (
        rows
          .filter((d) => d.type === 'cli')
          .map((d) => {
            const lastSeen = d.lastSeenAt
              ? new Date(d.lastSeenAt).getTime()
              : 0;
            const status =
              now - lastSeen > OFFLINE_THRESHOLD_MS ? 'offline' : d.status;
            return `- id: ${d.id} | name: ${d.name} | os: ${d.os ?? 'unknown'} | status: ${status}`;
          })
          .join('\n') || 'No CLI devices registered.'
      );
    }
    // ── CLI Agent Task ────────────────────────────────────────────────
    case 'execute_on_cli': {
      const taskId = await createAgentTask({
        prompt: args.prompt,
        channel: channelCtx?.channel || 'web',
        chatId: channelCtx?.chatId,
        conversationId: channelCtx?.conversationId,
        deviceId: args.device_id ?? undefined,
      });
      const deviceLabel = args.device_id ? ` on device ${args.device_id}` : '';
      return `Task delegated to CLI agent${deviceLabel} (id: ${taskId}). The user's PC will execute this and the result will be sent back to this channel. You can tell the user their request is being processed on their computer.`;
    }
    // ── Recurring Tasks ──────────────────────────────────────────────
    case 'create_recurring_task': {
      const { id, nextRun } = await createRecurringTask({
        name: args.name,
        prompt: args.prompt,
        cron: args.cron,
        channel: channelCtx?.channel || 'web',
        chatId: channelCtx?.chatId,
        conversationId: channelCtx?.conversationId,
      });
      const nextStr = nextRun
        ? nextRun.toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : 'N/A';
      return `Recurring task "${args.name}" created (id: ${id}). Cron: ${args.cron}. Next run: ${nextStr}.`;
    }
    case 'list_recurring_tasks': {
      const tasks = await listRecurringTasks();
      if (tasks.length === 0) return 'No recurring tasks configured.';
      return tasks
        .map((t) => {
          const status = t.enabled ? '✅' : '⏸️';
          const next = t.nextRunAt
            ? new Date(t.nextRunAt).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : 'N/A';
          return `- ${status} [${t.id}] "${t.name}" — cron: ${t.cron} — next: ${next} — runs: ${t.runCount}`;
        })
        .join('\n');
    }
    case 'cancel_recurring_task': {
      await cancelRecurringTask(args.id);
      return `Recurring task ${args.id} cancelled and deleted.`;
    }
    // ── Secrets Vault ─────────────────────────────────────────────────
    case 'save_secret': {
      const result = await saveSecret(
        args.service,
        args.key,
        args.value,
        args.is_password ?? false,
      );
      const masked = args.is_password ? '••••••••' : args.value;
      return `Secret saved: ${result.service}/${result.key} = "${masked}" (id: ${result.id})`;
    }
    case 'get_secret': {
      const value = await getSecret(args.service, args.key);
      if (value === null)
        return `No secret found for ${args.service}/${args.key}.`;
      return value;
    }
    case 'list_secrets': {
      const secrets = await listSecrets(args.service);
      if (secrets.length === 0) return 'No secrets stored yet.';
      return secrets
        .map(
          (s) =>
            `- [${s.id}] ${s.service}/${s.key}: ${s.value}${s.isPassword ? ' (hashed)' : ''}`,
        )
        .join('\n');
    }
    case 'delete_secret': {
      await deleteSecret(args.id);
      return `Secret ${args.id} deleted.`;
    }
    // ── Brain Knowledge ──────────────────────────────────────────────
    case 'brain_save_knowledge': {
      const result = await saveKnowledge(
        args.category as KnowledgeCategory,
        args.slug,
        args.title,
        args.content,
      );
      return result.success
        ? `Knowledge saved: ${result.path}`
        : `Failed to save knowledge: ${result.message}`;
    }
    case 'brain_list_knowledge': {
      const entries = await listKnowledge(args.category as KnowledgeCategory);
      if (entries.length === 0) return 'No knowledge entries yet.';
      return entries
        .map(
          (e) =>
            `- [${e.category}/${e.slug}] ${e.title} (${Math.round(e.size / 1024)}KB, updated ${e.updatedAt.toLocaleDateString()})`,
        )
        .join('\n');
    }
    case 'brain_delete_knowledge': {
      const result = await deleteKnowledge(
        args.category as KnowledgeCategory,
        args.slug,
      );
      return result.success
        ? result.message
        : `Failed to delete: ${result.message}`;
    }
    // ── Web fetch ────────────────────────────────────────────────────
    case 'fetch_url': {
      const rawUrl = args.url as string;
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        return 'Error: Only http:// and https:// URLs are supported.';
      }
      let urlObj: URL;
      try {
        urlObj = new URL(rawUrl);
      } catch {
        return 'Error: Invalid URL.';
      }
      if (isPrivateHost(urlObj.hostname)) {
        return 'Error: Access to private/local network addresses is not allowed.';
      }
      try {
        const response = await fetch(rawUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; GummBot/1.0; +https://gumm.app)',
            Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
          },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) {
          return `Error: HTTP ${response.status} when fetching URL.`;
        }
        const contentType = response.headers.get('content-type') || '';
        const raw = await response.text();
        const content = contentType.includes('text/html')
          ? extractTextFromHtml(raw)
          : raw.slice(0, 8000);
        if (!content.trim()) return 'No readable content found at this URL.';
        return content.length > 8000
          ? content.slice(0, 8000) + '\n\n[Content truncated]'
          : content;
      } catch (err: any) {
        if (err.name === 'TimeoutError') return 'Error: Request timed out.';
        return `Error fetching URL: ${err.message}`;
      }
    }
    default:
      return null;
  }
}

/** Returns true for private / loopback hostnames (SSRF protection). */
function isPrivateHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  )
    return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      a === 169 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
      return true;
  }
  return false;
}

/** Extract readable text from raw HTML. */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(
      /<\/?(?:p|div|h[1-6]|li|br|tr|td|th|article|section|blockquote)[^>]*>/gi,
      '\n',
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
