/**
 * POST /api/commands
 *
 * Create a new user command.
 * Body: { name, shortDescription, description }
 */
import { commands } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    name: string;
    shortDescription: string;
    description: string;
  }>(event);

  if (!body?.name?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Command name is required',
    });
  }

  if (!body?.shortDescription?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Short description is required',
    });
  }

  if (!body?.description?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Description is required',
    });
  }

  // Validate command name format (lowercase alphanumeric with underscores)
  const name = body.name.trim().toLowerCase().replace(/^\//, '');
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw createError({
      statusCode: 400,
      message:
        'Command name must be lowercase letters, numbers, and underscores only',
    });
  }

  const now = new Date();
  const id = crypto.randomUUID();

  try {
    await useDrizzle().insert(commands).values({
      id,
      name,
      shortDescription: body.shortDescription.trim(),
      description: body.description.trim(),
      moduleId: null, // User-created
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      throw createError({
        statusCode: 409,
        message: `Command "/${name}" already exists`,
      });
    }
    throw err;
  }

  return { ok: true, id, name };
});
