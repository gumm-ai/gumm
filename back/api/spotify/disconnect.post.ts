/**
 * POST /api/spotify/disconnect
 *
 * Disconnect Spotify OAuth — clears tokens from the api_connections registry.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';
import { decryptConfig, encryptConfig } from '../../utils/connection-crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'spotify'));

  if (!conn) {
    return { ok: true };
  }

  const config = decryptConfig(conn.config);

  const cleaned = {
    clientId: config.clientId || '',
    clientSecret: config.clientSecret || '',
  };

  const now = new Date();
  await useDrizzle()
    .update(apiConnections)
    .set({
      config: encryptConfig(cleaned),
      status: 'disconnected',
      error: null,
      updatedAt: now,
    })
    .where(eq(apiConnections.id, 'spotify'));

  const brain = useBrain();
  brain.events.emit('spotify', 'spotify.disconnected', {}).catch(() => {});

  return { ok: true };
});
