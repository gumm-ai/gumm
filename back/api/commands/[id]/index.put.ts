/**
 * PUT /api/commands/:id
 *
 * Update a command. Only user-created commands can have name changed.
 * Module commands can only toggle enabled state.
 * Body: { name?, shortDescription?, description?, enabled? }
 */
import { eq } from 'drizzle-orm';
import { commands } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Command ID is required' });
  }

  const body = await readBody<{
    name?: string;
    shortDescription?: string;
    description?: string;
    enabled?: boolean;
  }>(event);

  const [existing] = await useDrizzle()
    .select()
    .from(commands)
    .where(eq(commands.id, id))
    .limit(1);

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Command not found' });
  }

  const isModuleCommand = !!existing.moduleId;
  const updates: Partial<typeof existing> = {
    updatedAt: new Date(),
  };

  // Module commands can only toggle enabled
  if (isModuleCommand) {
    if (typeof body.enabled === 'boolean') {
      updates.enabled = body.enabled;
    }
  } else {
    // User commands can update everything
    if (body.name !== undefined) {
      const name = body.name.trim().toLowerCase().replace(/^\//, '');
      if (!/^[a-z0-9_]+$/.test(name)) {
        throw createError({
          statusCode: 400,
          message:
            'Command name must be lowercase letters, numbers, and underscores only',
        });
      }
      updates.name = name;
    }

    if (body.shortDescription !== undefined) {
      updates.shortDescription = body.shortDescription.trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description.trim();
    }

    if (typeof body.enabled === 'boolean') {
      updates.enabled = body.enabled;
    }
  }

  try {
    await useDrizzle().update(commands).set(updates).where(eq(commands.id, id));
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      throw createError({
        statusCode: 409,
        message: `Command "/${updates.name}" already exists`,
      });
    }
    throw err;
  }

  return { ok: true };
});
