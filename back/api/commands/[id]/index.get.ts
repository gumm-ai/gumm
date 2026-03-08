/**
 * GET /api/commands/:id
 *
 * Get a single command by ID.
 */
import { eq } from 'drizzle-orm';
import { commands, commandModules } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Command ID is required' });
  }

  const db = useDrizzle();

  const [cmd] = await db
    .select()
    .from(commands)
    .where(eq(commands.id, id))
    .limit(1);

  if (!cmd) {
    throw createError({ statusCode: 404, message: 'Command not found' });
  }

  const links = await db
    .select({ moduleId: commandModules.moduleId })
    .from(commandModules)
    .where(eq(commandModules.commandId, id));

  return {
    id: cmd.id,
    name: cmd.name,
    shortDescription: cmd.shortDescription,
    description: cmd.description,
    moduleId: cmd.moduleId,
    enabled: cmd.enabled,
    isUserCreated: !cmd.moduleId,
    linkedModuleIds: links.map((l) => l.moduleId),
    createdAt: cmd.createdAt,
    updatedAt: cmd.updatedAt,
  };
});
