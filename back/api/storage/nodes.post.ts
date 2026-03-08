/**
 * POST /api/storage/nodes
 *
 * Register a new storage node.
 * Body: { name, url }
 * Returns the generated auth token (shown once).
 */
import { storageNodes } from '../../db/schema';
import { randomUUID, randomBytes } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    name: string;
    url: string;
  }>(event);

  if (!body?.name?.trim() || !body?.url?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'name and url are required',
    });
  }

  // Validate URL format
  try {
    new URL(body.url.trim());
  } catch {
    throw createError({
      statusCode: 400,
      message: 'Invalid URL format',
    });
  }

  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const now = new Date();

  await useDrizzle()
    .insert(storageNodes)
    .values({
      id,
      name: body.name.trim(),
      url: body.url.trim().replace(/\/+$/, ''),
      token,
      role: 'primary',
      status: 'offline',
      createdAt: now,
      updatedAt: now,
    });

  return { ok: true, id, token, name: body.name.trim() };
});
