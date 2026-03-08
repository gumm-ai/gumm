import * as z from 'zod';

/**
 * Zod schema for a command definition in manifest.json
 */
export const CommandDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9_]+$/,
      'Command name must be lowercase alphanumeric with underscores',
    ),
  shortDescription: z.string().min(1).max(100),
  description: z.string().min(1),
});

export type CommandDefinition = z.infer<typeof CommandDefinitionSchema>;

/**
 * Zod schema for a schedule definition in manifest.json
 */
export const ScheduleDefinitionSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1), // croner-compatible cron expression
  handler: z.string().min(1), // exported function name in entrypoint
  description: z.string().default(''),
  payload: z.record(z.string(), z.any()).optional(), // static args
});

export type ScheduleDefinition = z.infer<typeof ScheduleDefinitionSchema>;

/**
 * Zod schema for custom config field definition
 */
export const ConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  placeholder: z.string().default(''),
  type: z.enum(['string', 'number', 'boolean', 'url']).default('string'),
  secret: z.boolean().default(false),
  required: z.boolean().default(true),
});

export type ConfigField = z.infer<typeof ConfigFieldSchema>;

/**
 * Zod schema for custom config requirements in manifest.json
 * Allows module creators to define API/credential requirements
 */
export const ConfigRequirementSchema = z.object({
  id: z.string().min(1), // Local ID, will be prefixed with module ID
  name: z.string().min(1), // Display name
  description: z.string().default(''),
  provider: z.string().default('custom'), // Provider type (custom, google, openai, etc)
  authType: z
    .enum(['oauth2', 'api_key', 'bearer', 'basic', 'none'])
    .default('api_key'),
  fields: z.array(ConfigFieldSchema).min(1),
  icon: z.string().optional(), // Iconify icon name
  color: z.string().optional(), // Tailwind color classes
  helpSteps: z.array(z.string()).optional(),
  helpUrl: z.string().optional(),
  helpLinks: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
      }),
    )
    .optional(),
});

export type ConfigRequirement = z.infer<typeof ConfigRequirementSchema>;

/**
 * Zod schema for module manifest.json validation
 */
export const ManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default('1.0.0'),
  description: z.string().default(''),
  entrypoint: z.string().default('index.ts'),
  capabilities: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  schema: z.record(z.string(), z.any()).optional(),
  schedules: z.array(ScheduleDefinitionSchema).default([]),
  commands: z.array(CommandDefinitionSchema).default([]),
  configRequirements: z.array(ConfigRequirementSchema).default([]),
  author: z
    .object({
      name: z.string(),
      url: z.string().optional(),
    })
    .optional(),
  repository: z.string().optional(),
  examples: z.array(z.string()).optional(),
  defaultEnabled: z.boolean().default(true),
});

export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * Represents a tool definition injected into OpenRouter
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * A loaded module's runtime representation
 */
export interface LoadedModule {
  manifest: Manifest;
  tools: () => ToolDefinition[];
  handler: (
    toolName: string,
    args: Record<string, any>,
    ctx?: any,
  ) => Promise<string>;
  status: 'loaded' | 'error';
  error?: string;
}
