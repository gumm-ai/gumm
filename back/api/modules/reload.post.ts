/**
 * POST /api/modules/reload
 *
 * Force-reload all modules from /modules/user/
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const registry = useModuleRegistry();
  await registry.reloadAll();

  return { ok: true };
});
