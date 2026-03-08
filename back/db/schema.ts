import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';

// ─── Modules ────────────────────────────────────────────────────────────────

export const modules = sqliteTable('modules', {
  id: text('id').primaryKey(), // ex: "weather-tool"
  name: text('name').notNull(),
  version: text('version').notNull().default('1.0.0'),
  description: text('description').default(''),
  source: text('source', { enum: ['local', 'github'] })
    .notNull()
    .default('local'),
  sourceUrl: text('source_url'), // GitHub URL if applicable
  entrypoint: text('entrypoint').notNull().default('index.ts'),
  capabilities: text('capabilities').default('[]'), // JSON array
  schema: text('schema'), // JSON validation schema
  status: text('status', {
    enum: ['installed', 'active', 'error', 'disabled'],
  })
    .notNull()
    .default('installed'),
  error: text('error'),
  installedAt: integer('installed_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectModuleSchema = createSelectSchema(modules);
export const insertModuleSchema = createInsertSchema(modules);

// ─── Conversations ──────────────────────────────────────────────────────────

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(), // UUID
  title: text('title'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectConversationSchema = createSelectSchema(conversations);
export const insertConversationSchema = createInsertSchema(conversations);

// ─── Messages ───────────────────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(), // UUID
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', {
    enum: ['user', 'assistant', 'system', 'tool'],
  }).notNull(),
  content: text('content').notNull(),
  toolCallId: text('tool_call_id'), // If role = "tool"
  toolCalls: text('tool_calls'), // JSON, if assistant requested tool calls
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectMessageSchema = createSelectSchema(messages);
export const insertMessageSchema = createInsertSchema(messages);

// ─── Memory (Shared long-term memory) ───────────────────────────────────────

export const memory = sqliteTable('memory', {
  id: text('id').primaryKey(), // UUID
  namespace: text('namespace').notNull(), // "brain" | module_id
  key: text('key').notNull(),
  value: text('value').notNull(), // JSON
  type: text('type', {
    enum: ['fact', 'preference', 'context', 'event'],
  })
    .notNull()
    .default('fact'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectMemorySchema = createSelectSchema(memory);
export const insertMemorySchema = createInsertSchema(memory);

// ─── Events (Inter-island journal) ──────────────────────────────────────────

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(), // module_id or "brain"
  type: text('type').notNull(), // ex: "weather.fetched", "module.installed"
  payload: text('payload'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectEventSchema = createSelectSchema(events);
export const insertEventSchema = createInsertSchema(events);

// ─── Brain Config (Identity & settings) ─────────────────────────────────────

export const brainConfig = sqliteTable('brain_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

// ─── API Connections (Centralized API registry) ─────────────────────────────

export const apiConnections = sqliteTable('api_connections', {
  id: text('id').primaryKey(), // e.g. "google-main", "openai-prod"
  name: text('name').notNull(),
  provider: text('provider').notNull(), // "google", "openai", "custom", etc.
  authType: text('auth_type', {
    enum: ['oauth2', 'api_key', 'bearer', 'basic', 'none'],
  })
    .notNull()
    .default('api_key'),
  config: text('config').notNull().default('{}'), // JSON: credentials & settings
  status: text('status', {
    enum: ['connected', 'disconnected', 'error'],
  })
    .notNull()
    .default('disconnected'),
  error: text('error'),
  lastTestedAt: integer('last_tested_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectApiConnectionSchema = createSelectSchema(apiConnections);
export const insertApiConnectionSchema = createInsertSchema(apiConnections);

export const selectBrainConfigSchema = createSelectSchema(brainConfig);
export const insertBrainConfigSchema = createInsertSchema(brainConfig);

// ─── Schedules (Recurring tasks & reminders) ────────────────────────────────

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(), // UUID
  moduleId: text('module_id').notNull(), // owning module or "system"
  name: text('name').notNull(), // schedule identifier
  cron: text('cron').notNull(), // cron expression (croner syntax)
  handler: text('handler').notNull(), // handler function name in module
  payload: text('payload'), // JSON — static args passed to handler
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
  runCount: integer('run_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectScheduleSchema = createSelectSchema(schedules);
export const insertScheduleSchema = createInsertSchema(schedules);

// ─── Personal Facts (Owner profile & preferences) ───────────────────────────

export const personalFacts = sqliteTable('personal_facts', {
  id: text('id').primaryKey(), // UUID
  category: text('category', {
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
  })
    .notNull()
    .default('other'),
  key: text('key').notNull(), // e.g. "first_name", "hates_broccoli"
  value: text('value').notNull(), // The actual info
  source: text('source', { enum: ['auto', 'manual'] })
    .notNull()
    .default('auto'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectPersonalFactSchema = createSelectSchema(personalFacts);
export const insertPersonalFactSchema = createInsertSchema(personalFacts);

// ─── Reminders (One-shot LLM-scheduled alerts) ─────────────────────────────

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(), // UUID
  message: text('message').notNull(), // What to remind
  triggerAt: integer('trigger_at', { mode: 'timestamp_ms' }).notNull(),
  channel: text('channel', { enum: ['telegram', 'web'] })
    .notNull()
    .default('web'),
  chatId: integer('chat_id'), // Telegram chat ID (null for web)
  conversationId: text('conversation_id'), // Web conversation ID
  fired: integer('fired', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectReminderSchema = createSelectSchema(reminders);
export const insertReminderSchema = createInsertSchema(reminders);

// ─── Recurring Tasks (Cron-based LLM-scheduled autonomous actions) ──────────

export const recurringTasks = sqliteTable('recurring_tasks', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull(), // Human-readable label
  prompt: text('prompt').notNull(), // Instruction the LLM will execute
  cron: text('cron').notNull(), // Cron expression (croner syntax)
  channel: text('channel', { enum: ['telegram', 'web'] })
    .notNull()
    .default('web'),
  chatId: integer('chat_id'), // Telegram chat ID (null for web)
  conversationId: text('conversation_id'), // Web conversation ID
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
  runCount: integer('run_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectRecurringTaskSchema = createSelectSchema(recurringTasks);
export const insertRecurringTaskSchema = createInsertSchema(recurringTasks);

// ─── Agent Tasks (CLI ↔ Telegram bridge) ────────────────────────────────────

export const agentTasks = sqliteTable('agent_tasks', {
  id: text('id').primaryKey(), // UUID
  status: text('status', {
    enum: ['pending', 'claimed', 'running', 'done', 'failed', 'timeout'],
  })
    .notNull()
    .default('pending'),
  prompt: text('prompt').notNull(), // Instruction for the CLI agent
  result: text('result'), // JSON result from CLI execution
  channel: text('channel', { enum: ['telegram', 'web'] })
    .notNull()
    .default('telegram'),
  chatId: integer('chat_id'), // Telegram chat ID for reply
  conversationId: text('conversation_id'), // Conversation ID
  claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectAgentTaskSchema = createSelectSchema(agentTasks);
export const insertAgentTaskSchema = createInsertSchema(agentTasks);

// ─── Module Data (Scoped key-value storage for modules) ─────────────────────

export const moduleData = sqliteTable('module_data', {
  id: text('id').primaryKey(), // UUID
  moduleId: text('module_id').notNull(), // owning module ID
  key: text('key').notNull(), // e.g. "credits_snapshot"
  value: text('value').notNull(), // JSON payload
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectModuleDataSchema = createSelectSchema(moduleData);
export const insertModuleDataSchema = createInsertSchema(moduleData);

// ─── User Secrets (Local credential vault — never sent to LLM) ──────────────

export const userSecrets = sqliteTable('user_secrets', {
  id: text('id').primaryKey(), // UUID
  service: text('service').notNull(), // e.g. "netflix", "github", "wifi-home"
  key: text('key').notNull(), // e.g. "username", "password", "api_key"
  value: text('value').notNull(), // Plaintext for non-passwords, hash for passwords
  isPassword: integer('is_password', { mode: 'boolean' })
    .notNull()
    .default(false),
  salt: text('salt'), // Salt for password hashing (null if not a password)
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectUserSecretSchema = createSelectSchema(userSecrets);
export const insertUserSecretSchema = createInsertSchema(userSecrets);

// ─── Storage Nodes (Centralized file storage devices — "stomach") ───────────

export const storageNodes = sqliteTable('storage_nodes', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull(), // Human-readable label (e.g. "VPS Paris", "Home NAS")
  url: text('url').notNull(), // Base URL of the device running gumm up --storage
  token: text('token').notNull(), // Auth token for storage API calls
  role: text('role', {
    enum: ['primary', 'replica'],
  })
    .notNull()
    .default('primary'),
  status: text('status', {
    enum: ['online', 'offline', 'error'],
  })
    .notNull()
    .default('offline'),
  totalBytes: integer('total_bytes'), // Total disk space (reported by node)
  usedBytes: integer('used_bytes'), // Used disk space
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectStorageNodeSchema = createSelectSchema(storageNodes);
export const insertStorageNodeSchema = createInsertSchema(storageNodes);

// ─── Connected Devices (CLI agents & storage nodes) ─────────────────────────

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull(), // Human-readable label (hostname or custom)
  type: text('type', {
    enum: ['cli', 'storage'],
  }).notNull(),
  os: text('os'), // "linux", "darwin", "windows"
  arch: text('arch'), // "amd64", "arm64"
  version: text('version'), // CLI version
  status: text('status', {
    enum: ['online', 'offline'],
  })
    .notNull()
    .default('offline'),
  ip: text('ip'), // Last known IP
  vpnIp: text('vpn_ip'), // Tailscale/WireGuard IP (e.g. 100.64.0.3)
  vpnType: text('vpn_type', {
    enum: ['tailscale', 'wireguard'],
  }), // VPN type or null if no VPN
  vpnPubkey: text('vpn_pubkey'), // WireGuard public key (WG mode only)
  internalPort: integer('internal_port'), // Port on the VPN network
  capabilities: text('capabilities').default('[]'), // JSON array: ["agent", "storage"]
  storageNodeId: text('storage_node_id'), // Link to storage_nodes if type=storage
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectDeviceSchema = createSelectSchema(devices);
export const insertDeviceSchema = createInsertSchema(devices);

// ─── Commands (Slash commands for chat, Telegram, CLI) ──────────────────────

export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull().unique(), // Command name without slash (e.g. "help")
  shortDescription: text('short_description').notNull(), // Brief one-liner
  description: text('description').notNull(), // Detailed description/instructions
  moduleId: text('module_id'), // null = user-created, otherwise module ID
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const selectCommandSchema = createSelectSchema(commands);
export const insertCommandSchema = createInsertSchema(commands);
