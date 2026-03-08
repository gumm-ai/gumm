/**
 * GET /api/modules
 *
 * Returns the list of all modules with metadata from the database.
 * Includes source, install date, enriched status info, and update_available.
 */
import { modules as modulesTable } from '../../db/schema';

// Simple in-memory cache for update checks (avoids hammering GitHub)
const updateCache = new Map<
  string,
  { available: boolean; remoteVersion: string | null; checkedAt: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function checkUpdateAvailable(mod: {
  id: string;
  version: string;
  source: string;
  sourceUrl: string | null;
}): Promise<{ available: boolean; remoteVersion: string | null }> {
  if (mod.source !== 'github' || !mod.sourceUrl) {
    return { available: false, remoteVersion: null };
  }

  const cached = updateCache.get(mod.id);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return { available: cached.available, remoteVersion: cached.remoteVersion };
  }

  try {
    const urlMatch = mod.sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) return { available: false, remoteVersion: null };

    const repo = `${urlMatch[1]}/${urlMatch[2]}`;
    const remoteManifest = await fetchRemoteManifest(repo);
    const available = remoteManifest.version !== mod.version;
    const result = { available, remoteVersion: remoteManifest.version };

    updateCache.set(mod.id, { ...result, checkedAt: Date.now() });
    return result;
  } catch {
    // If we can't reach GitHub, don't block the response
    return { available: false, remoteVersion: null };
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  // Read from DB for full metadata (source, dates, etc.)
  const dbModules = await useDrizzle().select().from(modulesTable);

  // Also get runtime info from registry
  const registry = useModuleRegistry();
  const runtimeModules = registry.getAll();
  const runtimeMap = new Map(runtimeModules.map((m) => [m.manifest.id, m]));

  // Check updates in parallel for GitHub modules
  const updateChecks = await Promise.all(
    dbModules.map((mod) => checkUpdateAvailable(mod)),
  );

  return dbModules.map((mod, i) => {
    const runtime = runtimeMap.get(mod.id);
    const update = updateChecks[i];
    return {
      id: mod.id,
      name: mod.name,
      version: mod.version,
      description: mod.description,
      source: mod.source,
      sourceUrl: mod.sourceUrl,
      capabilities: mod.capabilities ? JSON.parse(mod.capabilities) : [],
      status: mod.status,
      error: mod.error,
      installedAt: mod.installedAt,
      updatedAt: mod.updatedAt,
      // Runtime status: is the module actually loaded and working?
      runtimeStatus: runtime?.status || 'not-loaded',
      runtimeError: runtime?.error,
      // Update availability (async background check with cache)
      updateAvailable: update?.available ?? false,
      remoteVersion: update?.remoteVersion ?? null,
      // Manifest extras (from runtime, if loaded)
      author: runtime?.manifest?.author ?? null,
      repository: runtime?.manifest?.repository ?? null,
      examples: runtime?.manifest?.examples ?? [],
      // Tool definitions (safe to expose — only schemas, no handlers)
      tools: runtime
        ? runtime.tools().map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          }))
        : [],
    };
  });
});
