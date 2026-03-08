/**
 * DELETE /api/devices/:id
 *
 * Remove a device from the registry.
 */
import { devices } from '../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Device ID required' });
  }

  const db = useDrizzle();
  const existing = await db
    .select()
    .from(devices)
    .where(eq(devices.id, id))
    .get();

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Device not found' });
  }

  await db.delete(devices).where(eq(devices.id, id));

  return { ok: true, removed: existing.name };
});
