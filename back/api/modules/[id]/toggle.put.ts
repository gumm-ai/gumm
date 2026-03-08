/**
 * PUT /api/modules/:id/toggle
 *
 * Toggle a module between "active" and "disabled" status.
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

  const [existing] = await useDrizzle()
    .select()
    .from(modulesTable)
    .where(eq(modulesTable.id, moduleId))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Module not found' });
  }

  const newStatus = existing.status === 'active' ? 'disabled' : 'active';
  const now = new Date();

  await useDrizzle()
    .update(modulesTable)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(modulesTable.id, moduleId));

  // If disabling, unload from registry; if enabling, reload
  const registry = useModuleRegistry();
  if (newStatus === 'disabled') {
    registry.unloadModule(moduleId);
  } else {
    await registry.loadModule(moduleId);
  }

  await emitEvent(
    'brain',
    `module.${newStatus === 'active' ? 'enabled' : 'disabled'}`,
    {
      id: moduleId,
      name: existing.name,
    },
  );

  return {
    ok: true,
    id: moduleId,
    status: newStatus,
  };
});
