import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { watch as fsWatch, type FSWatcher } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import {
  ManifestSchema,
  type LoadedModule,
  type ToolDefinition,
  type Manifest,
  type ConfigRequirement,
} from './module-types';
import {
  modules as modulesTable,
  apiConnections,
  commands,
} from '../db/schema';
import { useBrainScheduler } from '../core/scheduler';
import { decryptConfig, encryptConfig } from './connection-crypto';

declare const process: NodeJS.Process;

const MODULES_DIR = join(process.cwd(), 'modules/user');
const OFFICIAL_MODULES_DIR = join(process.cwd(), 'modules/official');

/**
 * Singleton Module Registry
 * Watches /modules/user/ and hot-loads modules using dynamic import().
 * Also scans /modules/official/ (bundled in Docker) on startup.
 */
class ModuleRegistry {
  private modules = new Map<string, LoadedModule>();
  private watcher: FSWatcher | null = null;
  private _initPromise: Promise<void> | null = null;
  /** Event subscriptions registered by modules, keyed by moduleId */
  private moduleSubscriptions = new Map<
    string,
    Array<{ pattern: string; handler: any }>
  >();

  /**
   * Initialize the registry: scan directory & start watcher.
   * Safe to call multiple times — only runs once.
   */
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit() {
    console.log('[ModuleRegistry] Initializing...');
    await this.scanAll();
    this.startWatcher();
  }

  /**
   * Ensure the registry is ready before using it.
   */
  async ready() {
    if (this._initPromise) await this._initPromise;
  }

  /**
   * Scan both modules/official/ (bundled) and modules/user/ (volume-mounted)
   */
  async scanAll() {
    this.modules.clear();

    // 1. Official modules (bundled in Docker image, read-only)
    await this.scanDir(OFFICIAL_MODULES_DIR, 'local').catch(() => {});

    // 2. User modules (mounted volume)
    try {
      const entries = await readdir(MODULES_DIR, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory());

      for (const dir of dirs) {
        await this.loadModuleFromDir(MODULES_DIR, dir.name);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.warn(
          `[ModuleRegistry] Directory ${MODULES_DIR} not found, creating it...`,
        );
        const { mkdir } = await import('node:fs/promises');
        await mkdir(MODULES_DIR, { recursive: true });
      } else {
        console.error('[ModuleRegistry] Scan error:', err.message);
      }
    }

    console.log(`[ModuleRegistry] Loaded ${this.modules.size} module(s)`);
  }

  /**
   * Scan a directory and load all valid modules from it.
   */
  private async scanDir(baseDir: string, source: 'local' | 'github') {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    for (const dir of dirs) {
      await this.loadModuleFromDir(baseDir, dir.name, source);
    }
  }

  /**
   * Load a single module by directory name.
   * Checks modules/official/ first, then modules/user/.
   */
  async loadModule(dirName: string) {
    const officialPath = join(OFFICIAL_MODULES_DIR, dirName, 'manifest.json');
    try {
      await readFile(officialPath, 'utf-8');
      return this.loadModuleFromDir(OFFICIAL_MODULES_DIR, dirName, 'local');
    } catch {
      return this.loadModuleFromDir(MODULES_DIR, dirName);
    }
  }

  /**
   * Load a single module from an arbitrary base directory.
   */
  async loadModuleFromDir(
    baseDir: string,
    dirName: string,
    source: 'local' | 'github' = 'local',
  ) {
    const modulePath = join(baseDir, dirName);
    const manifestPath = join(modulePath, 'manifest.json');

    try {
      // Read and validate manifest
      const raw = await readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const manifest = ManifestSchema.parse(parsed);

      // Check if module is disabled in DB — skip loading if so
      const [existingRow] = await useDrizzle()
        .select({ status: modulesTable.status })
        .from(modulesTable)
        .where(eq(modulesTable.id, manifest.id))
        .limit(1);

      if (existingRow?.status === 'disabled') {
        console.log(
          `[ModuleRegistry] ○ Skipped (disabled): ${manifest.name} (${manifest.id})`,
        );
        return;
      }

      // If first time loading and defaultEnabled is false, persist as disabled and skip
      if (!existingRow && manifest.defaultEnabled === false) {
        await this.upsertModuleInDB(manifest, 'disabled', undefined, source);
        console.log(
          `[ModuleRegistry] ○ Registered (disabled by default): ${manifest.name} (${manifest.id})`,
        );
        return;
      }

      // Dynamic import of the entrypoint (Bun handles .ts natively)
      const entryPath = join(modulePath, manifest.entrypoint);
      // Cache-bust with timestamp to allow hot-reload
      const entryUrl = `${entryPath}?t=${Date.now()}`;
      const mod = await import(entryUrl);

      if (
        typeof mod.tools !== 'function' ||
        typeof mod.handler !== 'function'
      ) {
        throw new Error(
          `Module "${manifest.id}" must export 'tools' and 'handler' functions`,
        );
      }

      this.modules.set(manifest.id, {
        manifest,
        tools: mod.tools,
        handler: mod.handler,
        status: 'loaded',
      });

      // Warn about missing dependencies
      if (manifest.dependencies && manifest.dependencies.length > 0) {
        const missing = manifest.dependencies.filter(
          (dep) =>
            !this.modules.has(dep) ||
            this.modules.get(dep)!.status !== 'loaded',
        );
        if (missing.length > 0) {
          console.warn(
            `[ModuleRegistry] ⚠ ${manifest.id} depends on [${missing.join(', ')}] which are not loaded yet`,
          );
        }
      }

      // Persist to DB
      await this.upsertModuleInDB(manifest, 'active', undefined, source);

      // Sync schedules declared in manifest
      if (manifest.schedules && manifest.schedules.length > 0) {
        try {
          const scheduler = useBrainScheduler();
          await scheduler.ready();
          await scheduler.syncModuleSchedules(manifest.id, manifest.schedules);
        } catch (err: any) {
          console.warn(
            `[ModuleRegistry] Schedule sync skipped for ${manifest.id}: ${err.message}`,
          );
        }
      }

      // Sync config requirements declared in manifest (creates API connection placeholders)
      if (
        manifest.configRequirements &&
        manifest.configRequirements.length > 0
      ) {
        try {
          await this.syncConfigRequirements(manifest);
        } catch (err: any) {
          console.warn(
            `[ModuleRegistry] Config sync skipped for ${manifest.id}: ${err.message}`,
          );
        }
      }

      // Sync commands declared in manifest
      if (manifest.commands && manifest.commands.length > 0) {
        try {
          await this.syncModuleCommands(manifest.id, manifest.commands);
        } catch (err: any) {
          console.warn(
            `[ModuleRegistry] Commands sync skipped for ${manifest.id}: ${err.message}`,
          );
        }
      }

      console.log(
        `[ModuleRegistry] ✓ Loaded: ${manifest.name} (${manifest.id})`,
      );
    } catch (err: any) {
      console.error(
        `[ModuleRegistry] ✗ Failed to load ${dirName}:`,
        err.message,
      );

      // Store with error status so UI can display it
      this.modules.set(dirName, {
        manifest: {
          id: dirName,
          name: dirName,
          version: '0.0.0',
          description: 'Failed to load',
          entrypoint: 'index.ts',
          capabilities: [],
          schedules: [],
          configRequirements: [],
          dependencies: [],
          defaultEnabled: true,
        },
        tools: () => [],
        handler: async () => `Error: Module ${dirName} failed to load`,
        status: 'error',
        error: err.message,
      });

      // Persist error state to DB
      await this.upsertModuleInDB(
        {
          id: dirName,
          name: dirName,
          version: '0.0.0',
          description: 'Failed to load',
          entrypoint: 'index.ts',
          capabilities: [],
        },
        'error',
        err.message,
      );
    }
  }

  /**
   * Upsert module metadata in the database
   */
  private async upsertModuleInDB(
    manifest: {
      id: string;
      name: string;
      version: string;
      description?: string;
      entrypoint: string;
      capabilities: string[];
      schema?: Record<string, any>;
    },
    status: 'installed' | 'active' | 'error' | 'disabled',
    error?: string,
    source: 'local' | 'github' = 'local',
  ) {
    try {
      const now = new Date();
      const existing = await useDrizzle()
        .select()
        .from(modulesTable)
        .where(eq(modulesTable.id, manifest.id))
        .limit(1);

      if (existing.length > 0) {
        await useDrizzle()
          .update(modulesTable)
          .set({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description || '',
            entrypoint: manifest.entrypoint,
            capabilities: JSON.stringify(manifest.capabilities),
            schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
            status,
            error: error || null,
            updatedAt: now,
          })
          .where(eq(modulesTable.id, manifest.id));
      } else {
        await useDrizzle()
          .insert(modulesTable)
          .values({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description || '',
            source,
            entrypoint: manifest.entrypoint,
            capabilities: JSON.stringify(manifest.capabilities),
            schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
            status,
            error: error || null,
            installedAt: now,
            updatedAt: now,
          });
      }
    } catch (dbErr: any) {
      // DB not ready yet (e.g. migrations not run) — fail silently
      console.warn(
        `[ModuleRegistry] DB upsert skipped for ${manifest.id}: ${dbErr.message}`,
      );
    }
  }

  /**
   * Sync config requirements declared in manifest to API connections.
   * Creates placeholder entries for module-defined configs if they don't exist.
   */
  private async syncConfigRequirements(manifest: Manifest) {
    if (
      !manifest.configRequirements ||
      manifest.configRequirements.length === 0
    ) {
      return;
    }

    const now = new Date();

    for (const req of manifest.configRequirements) {
      // Create a unique connection ID: module-{moduleId}-{configId}
      const connectionId = `module-${manifest.id}-${req.id}`;

      try {
        // Check if connection already exists
        const [existing] = await useDrizzle()
          .select()
          .from(apiConnections)
          .where(eq(apiConnections.id, connectionId))
          .limit(1);

        if (existing) {
          // Update metadata but preserve user-entered config values
          const existingConfig = decryptConfig(existing.config || '{}');
          const updatedConfig = {
            ...existingConfig,
            _moduleId: manifest.id,
            _configId: req.id,
            _fields: req.fields,
            _helpSteps: req.helpSteps,
            _helpUrl: req.helpUrl,
            _helpLinks: req.helpLinks,
            _icon: req.icon,
            _color: req.color,
            _description: req.description,
          };

          await useDrizzle()
            .update(apiConnections)
            .set({
              name: req.name,
              config: encryptConfig(updatedConfig),
              updatedAt: now,
            })
            .where(eq(apiConnections.id, connectionId));
        } else {
          // Create new connection with empty placeholder values
          const initialConfig: Record<string, any> = {
            _moduleId: manifest.id,
            _configId: req.id,
            _fields: req.fields,
            _helpSteps: req.helpSteps,
            _helpUrl: req.helpUrl,
            _helpLinks: req.helpLinks,
            _icon: req.icon,
            _color: req.color,
            _description: req.description,
          };

          // Initialize empty values for each field
          for (const field of req.fields) {
            initialConfig[field.key] = '';
          }

          await useDrizzle()
            .insert(apiConnections)
            .values({
              id: connectionId,
              name: req.name,
              provider: req.provider || 'custom',
              authType: req.authType || 'api_key',
              config: encryptConfig(initialConfig),
              status: 'disconnected',
              createdAt: now,
              updatedAt: now,
            });

          console.log(
            `[ModuleRegistry] Created config requirement: ${connectionId}`,
          );
        }
      } catch (err: any) {
        console.warn(
          `[ModuleRegistry] Failed to sync config requirement ${connectionId}: ${err.message}`,
        );
      }
    }
  }
  /**
   * Sync commands declared in module manifest to the database.
   * Creates/updates module commands, removes orphaned ones.
   */
  private async syncModuleCommands(
    moduleId: string,
    manifestCommands: Array<{
      name: string;
      shortDescription: string;
      description: string;
    }>,
  ) {
    const now = new Date();

    // Get existing module commands
    const existingCommands = await useDrizzle()
      .select()
      .from(commands)
      .where(eq(commands.moduleId, moduleId));

    const existingNames = new Set(existingCommands.map((c) => c.name));
    const manifestNames = new Set(manifestCommands.map((c) => c.name));

    // Insert or update commands from manifest
    for (const cmd of manifestCommands) {
      const existing = existingCommands.find((e) => e.name === cmd.name);

      if (existing) {
        // Update existing command
        await useDrizzle()
          .update(commands)
          .set({
            shortDescription: cmd.shortDescription,
            description: cmd.description,
            updatedAt: now,
          })
          .where(eq(commands.id, existing.id));
      } else {
        // Check if a user command with the same name exists
        const [userCmd] = await useDrizzle()
          .select()
          .from(commands)
          .where(
            and(
              eq(commands.name, cmd.name),
              eq(commands.moduleId, null as any),
            ),
          )
          .limit(1);

        if (userCmd) {
          console.warn(
            `[ModuleRegistry] Command /${cmd.name} from ${moduleId} conflicts with user command, skipping`,
          );
          continue;
        }

        // Insert new command
        await useDrizzle().insert(commands).values({
          id: crypto.randomUUID(),
          name: cmd.name,
          shortDescription: cmd.shortDescription,
          description: cmd.description,
          moduleId,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        });

        console.log(
          `[ModuleRegistry] Created command /${cmd.name} from ${moduleId}`,
        );
      }
    }

    // Remove commands that are no longer in manifest
    for (const existing of existingCommands) {
      if (!manifestNames.has(existing.name)) {
        await useDrizzle().delete(commands).where(eq(commands.id, existing.id));
        console.log(
          `[ModuleRegistry] Removed orphaned command /${existing.name} from ${moduleId}`,
        );
      }
    }
  }
  /**
   * Start watching the modules/user directory for changes
   */
  private startWatcher() {
    try {
      this.watcher = fsWatch(
        MODULES_DIR,
        { recursive: true },
        async (eventType, filename) => {
          if (!filename) return;

          // Extract the module directory name
          const dirName = filename.split('/')[0];
          if (!dirName) return;

          console.log(
            `[ModuleRegistry] Change detected in "${dirName}" (${eventType})`,
          );

          // Debounce: reload after a short delay
          setTimeout(() => this.loadModule(dirName), 200);
        },
      );

      console.log('[ModuleRegistry] File watcher started');
    } catch {
      console.warn('[ModuleRegistry] Could not start file watcher');
    }
  }

  /**
   * Get all loaded modules
   */
  getAll(): LoadedModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get aggregated tool definitions from all loaded modules
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const mod of this.modules.values()) {
      if (mod.status === 'loaded') {
        try {
          tools.push(...mod.tools());
        } catch (err: any) {
          console.error(
            `[ModuleRegistry] Error getting tools from ${mod.manifest.id}:`,
            err.message,
          );
        }
      }
    }
    return tools;
  }

  /**
   * Get tool definitions from specific modules only
   */
  getToolsForModules(moduleIds: string[]): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const id of moduleIds) {
      const mod = this.modules.get(id);
      if (mod && mod.status === 'loaded') {
        try {
          tools.push(...mod.tools());
        } catch (err: any) {
          console.error(
            `[ModuleRegistry] Error getting tools from ${mod.manifest.id}:`,
            err.message,
          );
        }
      }
    }
    return tools;
  }

  /**
   * Call a specific module's tool directly (inter-module RPC).
   * Allows Module A to invoke Module B's handler without going through the LLM.
   */
  async callModuleTool(
    callerModuleId: string,
    targetModuleId: string,
    toolName: string,
    args: Record<string, any>,
  ): Promise<string> {
    const target = this.modules.get(targetModuleId);
    if (!target || target.status !== 'loaded') {
      return `Module "${targetModuleId}" is not available`;
    }

    const toolNames = target.tools().map((t) => t.function.name);
    if (!toolNames.includes(toolName)) {
      return `Tool "${toolName}" not found in module "${targetModuleId}"`;
    }

    try {
      let ctx: any;
      try {
        const brain = useBrain();
        ctx = brain.buildModuleContext(targetModuleId);
      } catch {
        /* Brain not ready */
      }
      return await target.handler(toolName, args, ctx);
    } catch (err: any) {
      return `Error calling ${targetModuleId}.${toolName}: ${err.message}`;
    }
  }

  /**
   * Register an event subscription for a module (tracked for cleanup on unload).
   */
  registerModuleSubscription(moduleId: string, pattern: string, handler: any) {
    if (!this.moduleSubscriptions.has(moduleId)) {
      this.moduleSubscriptions.set(moduleId, []);
    }
    this.moduleSubscriptions.get(moduleId)!.push({ pattern, handler });
  }

  /**
   * Remove all event subscriptions for a module.
   */
  removeModuleSubscriptions(moduleId: string, eventBus: any) {
    const subs = this.moduleSubscriptions.get(moduleId);
    if (subs) {
      for (const { pattern, handler } of subs) {
        eventBus.off(pattern, handler);
      }
      this.moduleSubscriptions.delete(moduleId);
    }
  }

  /**
   * Execute a tool call by finding the appropriate module handler.
   * Injects ModuleContext (backward compatible — old modules ignore 3rd arg).
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
  ): Promise<string> {
    for (const mod of this.modules.values()) {
      if (mod.status !== 'loaded') continue;

      const toolNames = mod.tools().map((t) => t.function.name);
      if (toolNames.includes(toolName)) {
        try {
          // Build module context via Brain (if available)
          let ctx: any;
          try {
            const brain = useBrain();
            ctx = brain.buildModuleContext(mod.manifest.id);
          } catch {
            // Brain not ready — execute without context
          }
          return await mod.handler(toolName, args, ctx);
        } catch (err: any) {
          console.error(
            `[ModuleRegistry] Tool "${toolName}" failed:`,
            err.message,
          );
          return `Error executing tool "${toolName}": ${err.message}`;
        }
      }
    }
    return `Tool "${toolName}" not found in any module`;
  }

  /**
   * Unload a module from the registry (without touching files or DB)
   */
  unloadModule(moduleId: string) {
    if (this.modules.has(moduleId)) {
      this.modules.delete(moduleId);

      // Remove associated event subscriptions
      try {
        const brain = useBrain();
        this.removeModuleSubscriptions(moduleId, brain.events);
      } catch {
        /* Brain not ready */
      }

      // Remove associated schedules
      try {
        const scheduler = useBrainScheduler();
        scheduler
          .removeModuleSchedules(moduleId)
          .catch((err) =>
            console.warn(
              `[ModuleRegistry] Schedule cleanup failed for ${moduleId}: ${err.message}`,
            ),
          );
      } catch {
        // Scheduler not ready
      }

      // Remove associated commands
      this.removeModuleCommands(moduleId).catch((err) =>
        console.warn(
          `[ModuleRegistry] Command cleanup failed for ${moduleId}: ${err.message}`,
        ),
      );

      console.log(`[ModuleRegistry] Unloaded: ${moduleId}`);
    }
  }

  /**
   * Remove all commands associated with a module
   */
  private async removeModuleCommands(moduleId: string) {
    await useDrizzle().delete(commands).where(eq(commands.moduleId, moduleId));
    console.log(`[ModuleRegistry] Removed commands for ${moduleId}`);
  }

  /**
   * Force reload all modules
   */
  async reloadAll() {
    console.log('[ModuleRegistry] Reloading all modules...');
    await this.scanAll();
  }

  /**
   * Shutdown the registry and stop watching
   */
  destroy() {
    this.watcher?.close();
    this.modules.clear();
  }
}

// Singleton instance
let _registry: ModuleRegistry | null = null;

export function useModuleRegistry(): ModuleRegistry {
  if (!_registry) {
    _registry = new ModuleRegistry();
    // Fire and forget init — modules will be available shortly
    _registry
      .init()
      .catch((err) => console.error('[ModuleRegistry] Init failed:', err));
  }
  return _registry;
}
