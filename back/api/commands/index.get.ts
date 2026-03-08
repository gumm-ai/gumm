/**
 * GET /api/commands
 *
 * Returns all commands (user-created + module-installed).
 * Includes metadata about source (user or module).
 */
import { commands } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const allCommands = await useDrizzle()
    .select()
    .from(commands)
    .orderBy(commands.name);

  return allCommands.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    shortDescription: cmd.shortDescription,
    description: cmd.description,
    moduleId: cmd.moduleId,
    enabled: cmd.enabled,
    isUserCreated: !cmd.moduleId,
    createdAt: cmd.createdAt,
    updatedAt: cmd.updatedAt,
  }));
});
