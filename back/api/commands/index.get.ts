/**
 * GET /api/commands
 *
 * Returns all commands (user-created + module-installed).
 * Includes metadata about source (user or module).
 */
import { eq } from 'drizzle-orm';
import { commands, commandModules } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const db = useDrizzle();

  const allCommands = await db.select().from(commands).orderBy(commands.name);

  // Fetch linked modules for all commands in one query
  const allLinks = await db.select().from(commandModules);
  const linksByCommand = new Map<string, string[]>();
  for (const link of allLinks) {
    if (!linksByCommand.has(link.commandId)) {
      linksByCommand.set(link.commandId, []);
    }
    linksByCommand.get(link.commandId)!.push(link.moduleId);
  }

  return allCommands.map((cmd) => ({
    id: cmd.id,
    name: cmd.name,
    shortDescription: cmd.shortDescription,
    description: cmd.description,
    moduleId: cmd.moduleId,
    enabled: cmd.enabled,
    isUserCreated: !cmd.moduleId,
    linkedModuleIds: linksByCommand.get(cmd.id) || [],
    createdAt: cmd.createdAt,
    updatedAt: cmd.updatedAt,
  }));
});
