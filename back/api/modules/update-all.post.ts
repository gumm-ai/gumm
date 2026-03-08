/**
 * POST /api/modules/update-all
 *
 * Update all GitHub-sourced modules to their latest versions.
 */
import { eq } from 'drizzle-orm';
import { modules as modulesTable } from '../../db/schema';
import {
  fetchRemoteManifest,
  installModuleFromGitHub,
} from '../../utils/github-fetcher';

interface UpdateResult {
  ok: boolean;
  updated: number;
  failed: number;
  results: Array<{
    id: string;
    name: string;
    status: 'updated' | 'up-to-date' | 'error';
    previousVersion?: string;
    newVersion?: string;
    error?: string;
  }>;
}

export default defineEventHandler(async (event): Promise<UpdateResult> => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const results: UpdateResult['results'] = [];
  let updated = 0;
  let failed = 0;

  try {
    // Get all GitHub-sourced modules
    const installedModules = await useDrizzle()
      .select()
      .from(modulesTable)
      .where(eq(modulesTable.source, 'github'));

    for (const mod of installedModules) {
      if (!mod.sourceUrl) {
        results.push({
          id: mod.id,
          name: mod.name,
          status: 'error',
          error: 'No source URL',
        });
        failed++;
        continue;
      }

      try {
        // Extract repo from sourceUrl
        const repo = mod.sourceUrl
          .replace('https://github.com/', '')
          .replace('.git', '');

        // Check if update is available
        const remoteManifest = await fetchRemoteManifest(repo);

        if (compareVersions(remoteManifest.version, mod.version) <= 0) {
          results.push({
            id: mod.id,
            name: mod.name,
            status: 'up-to-date',
            previousVersion: mod.version,
          });
          continue;
        }

        // Update available - install new version
        const result = await installModuleFromGitHub({
          repo,
          force: true,
        });

        const now = new Date();

        // Update database
        await useDrizzle()
          .update(modulesTable)
          .set({
            version: result.module.version,
            description: result.module.description || '',
            capabilities: JSON.stringify(result.module.capabilities),
            schema: result.module.schema
              ? JSON.stringify(result.module.schema)
              : null,
            status: 'active',
            error: null,
            updatedAt: now,
          })
          .where(eq(modulesTable.id, mod.id));

        // Reload in registry
        const registry = useModuleRegistry();
        await registry.loadModule(mod.id);

        // Emit event
        await emitEvent('brain', 'module.updated', {
          id: mod.id,
          name: mod.name,
          previousVersion: mod.version,
          newVersion: result.module.version,
          source: 'github',
          repo,
        });

        results.push({
          id: mod.id,
          name: mod.name,
          status: 'updated',
          previousVersion: mod.version,
          newVersion: result.module.version,
        });
        updated++;
      } catch (err: any) {
        results.push({
          id: mod.id,
          name: mod.name,
          status: 'error',
          previousVersion: mod.version,
          error: err.message || 'Unknown error',
        });
        failed++;

        // Update status in DB
        await useDrizzle()
          .update(modulesTable)
          .set({
            status: 'error',
            error: `Update failed: ${err.message}`,
            updatedAt: new Date(),
          })
          .where(eq(modulesTable.id, mod.id));
      }
    }
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: `Failed to update modules: ${err.message}`,
    });
  }

  return {
    ok: failed === 0,
    updated,
    failed,
    results,
  };
});

/**
 * Compare two semver strings.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}
