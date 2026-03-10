/**
 * DELETE /api/commands/:id
 *
 * Delete a user-created command.
 * Module commands cannot be deleted directly (they're removed with the module).
 */
import { eq } from 'drizzle-orm';
import { commands } from '../../../db/schema';
import { syncCommandsWithTelegram } from '../../../utils/telegram';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Command ID is required' });
  }

  const [existing] = await useDrizzle()
    .select()
    .from(commands)
    .where(eq(commands.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Command not found' });
  }

  if (existing.moduleId) {
    throw createError({
      statusCode: 400,
      message:
        'Cannot delete module commands. Disable or uninstall the module instead.',
    });
  }

  await useDrizzle().delete(commands).where(eq(commands.id, id));

  syncCommandsWithTelegram().catch(() => {});

  return { ok: true };
});
