/**
 * POST /api/modules/install
 *
 * Install a module from a GitHub repository.
 * Body: { repo: "owner/repo", ref?: "main", force?: false }
 */
import { eq } from 'drizzle-orm';
import { modules as modulesTable } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    repo: string;
    ref?: string;
    force?: boolean;
    confirm?: boolean;
  }>(event);

  if (!body?.repo) {
    throw createError({
      statusCode: 400,
      message: 'repo is required (format: "owner/repo")',
    });
  }

  // Require explicit confirmation — modules run with full server-side access.
  // The caller must pass { confirm: true } to acknowledge the security risk.
  if (!body?.confirm) {
    throw createError({
      statusCode: 400,
      message:
        'Installing a module from GitHub grants it full server-side access ' +
        '(filesystem, network, environment variables). ' +
        'Pass { confirm: true } to acknowledge this risk and proceed.',
    });
  }

  try {
    // 1. Download, extract, validate
    const result = await installModuleFromGitHub({
      repo: body.repo,
      ref: body.ref,
      force: body.force,
    });

    const manifest = result.module;
    const now = new Date();

    // 2. Upsert in database
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
          source: 'github',
          sourceUrl: result.sourceUrl,
          entrypoint: manifest.entrypoint,
          capabilities: JSON.stringify(manifest.capabilities),
          schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
          status: 'active',
          error: null,
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
          source: 'github',
          sourceUrl: result.sourceUrl,
          entrypoint: manifest.entrypoint,
          capabilities: JSON.stringify(manifest.capabilities),
          schema: manifest.schema ? JSON.stringify(manifest.schema) : null,
          status: 'active',
          installedAt: now,
          updatedAt: now,
        });
    }

    // 3. Hot-load into ModuleRegistry
    const registry = useModuleRegistry();
    await registry.loadModule(manifest.id);

    // 4. Emit event
    await emitEvent('brain', 'module.installed', {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      source: 'github',
      repo: body.repo,
      ref: body.ref || 'main',
    });

    return {
      ok: true,
      module: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        source: 'github',
        sourceUrl: result.sourceUrl,
        capabilities: manifest.capabilities,
        status: 'active',
      },
    };
  } catch (err: any) {
    // Log the failed attempt
    await emitEvent('brain', 'module.install_failed', {
      repo: body.repo,
      error: err.message,
    }).catch(() => {});

    throw createError({
      statusCode: 422,
      message: err.message,
    });
  }
});
