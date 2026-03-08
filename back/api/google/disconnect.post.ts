/**
 * POST /api/google/disconnect
 *
 * Disconnect Google OAuth — clears tokens from the api_connections registry.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'google'));

  if (!conn) {
    return { ok: true };
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  // Keep clientId and clientSecret, only clear tokens
  const cleaned = {
    clientId: config.clientId || '',
    clientSecret: config.clientSecret || '',
  };

  const now = new Date();
  await useDrizzle()
    .update(apiConnections)
    .set({
      config: JSON.stringify(cleaned),
      status: 'disconnected',
      error: null,
      updatedAt: now,
    })
    .where(eq(apiConnections.id, 'google'));

  const brain = useBrain();
  brain.events.emit('google', 'google.disconnected', {}).catch(() => {});

  return { ok: true };
});
