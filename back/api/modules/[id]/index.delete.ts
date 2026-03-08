/**
 * DELETE /api/modules/:id
 *
 * Uninstall a module: remove from registry, delete files, DB entry, and memory.
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

  // Check module exists in DB
  const [existing] = await useDrizzle()
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Module not found' });
  }

  try {
    // 1. Unload from registry
    const registry = useModuleRegistry();
    registry.unloadModule(moduleId);

    // 2. Remove files from modules/user/
    await removeModuleFiles(moduleId);

    // 3. Remove DB entry
    await useDrizzle()
      .delete(modulesTable)
      .where(eq(modulesTable.id, moduleId));

    // 4. Clean up associated memory (namespace = module_id)
    await forgetAll(moduleId);

    // 5. Clean up module storage data
    const { removeModuleData } = await import('../../../utils/module-storage');
    await removeModuleData(moduleId);

    // 6. Emit event
    await emitEvent('brain', 'module.uninstalled', {
      id: moduleId,
      name: existing.name,
      source: existing.source,
    });

    return { ok: true };
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message: `Uninstall failed: ${err.message}`,
    });
  }
});
