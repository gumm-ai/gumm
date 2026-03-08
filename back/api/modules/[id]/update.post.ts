/**
 * POST /api/modules/:id/update
 *
 * Update a GitHub-sourced module to its latest version.
 * Compares local version with remote manifest, re-installs if newer.
 */
import { eq } from 'drizzle-orm';
import { modules as modulesTable } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const moduleId = getRouterParam(event, 'id');
  if (!moduleId) {
    throw createError({ statusCode: 400, message: 'Module ID required' });
  }

  // Find the module in DB
  const [existing] = await useDrizzle()
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Module not found' });
  }

  if (existing.source !== 'github' || !existing.sourceUrl) {
    throw createError({
      statusCode: 400,
      message: 'Only GitHub-sourced modules can be updated this way',
    });
  }

  // Extract owner/repo from sourceUrl
  const urlMatch = existing.sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!urlMatch) {
    throw createError({
      statusCode: 400,
      message: 'Invalid source URL format',
    });
  }

  const repo = `${urlMatch[1]}/${urlMatch[2]}`;

  try {
    // Fetch remote manifest to check version
    const remoteManifest = await fetchRemoteManifest(repo);
    const oldVersion = existing.version;

    if (remoteManifest.version === oldVersion) {
      return {
        ok: true,
        updated: false,
        message: `Module "${moduleId}" is already at version ${oldVersion}`,
        version: { before: oldVersion, after: oldVersion },
      };
    }

    // Re-install with force to overwrite
    const result = await installModuleFromGitHub({
      repo,
      force: true,
    });

    const manifest = result.module;
    const now = new Date();

    // Update DB
    await useDrizzle()
      .update(modulesTable)
      .set({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description || '',
        entrypoint: manifest.entrypoint,
        capabilities: JSON.stringify(manifest.capabilities),
        schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
        status: 'active',
        error: null,
        updatedAt: now,
      })
      .where(eq(modulesTable.id, moduleId));

    // Reload in registry
    const registry = useModuleRegistry();
    await registry.loadModule(moduleId);

    // Emit event
    await emitEvent('brain', 'module.updated', {
      id: moduleId,
      oldVersion,
      newVersion: manifest.version,
      repo,
    });

    return {
      ok: true,
      updated: true,
      version: { before: oldVersion, after: manifest.version },
      module: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
      },
    };
  } catch (err: any) {
    throw createError({
      statusCode: 422,
      message: `Update failed: ${err.message}`,
    });
  }
});
