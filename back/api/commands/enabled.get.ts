/**
 * GET /api/commands/enabled
 *
 * Returns only enabled commands. Used by CLI for suggestions.
 */
import { eq } from 'drizzle-orm';
import { commands, commandModules } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const db = useDrizzle();

  const enabledCommands = await db
    .select({
      id: commands.id,
      name: commands.name,
      shortDescription: commands.shortDescription,
      description: commands.description,
      moduleId: commands.moduleId,
    })
    .from(commands)
    .where(eq(commands.enabled, true))
    .orderBy(commands.name);

  // Fetch linked modules
  const allLinks = await db.select().from(commandModules);
  const linksByCommand = new Map<string, string[]>();
  for (const link of allLinks) {
    if (!linksByCommand.has(link.commandId)) {
      linksByCommand.set(link.commandId, []);
    }
    linksByCommand.get(link.commandId)!.push(link.moduleId);
  }

  return enabledCommands.map((cmd) => ({
    ...cmd,
    linkedModuleIds: linksByCommand.get(cmd.id) || [],
  }));
});
