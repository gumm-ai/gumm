/**
 * GET /api/commands/enabled
 *
 * Returns only enabled commands. Used by CLI for suggestions.
 */
import { eq } from 'drizzle-orm';
import { commands } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const enabledCommands = await useDrizzle()
    .select({
      name: commands.name,
      shortDescription: commands.shortDescription,
      description: commands.description,
      moduleId: commands.moduleId,
    })
    .from(commands)
    .where(eq(commands.enabled, true))
    .orderBy(commands.name);

  return enabledCommands;
});
