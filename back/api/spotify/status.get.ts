/**
 * GET /api/spotify/status
 *
 * Returns the current Spotify connection status from the centralized registry.
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
    .where(eq(apiConnections.id, 'spotify'));

  if (!conn) {
    return { configured: false, oauthComplete: false, enabled: false };
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  if (config.clientId && !config.refreshToken) {
    return {
      configured: false,
      oauthComplete: false,
      enabled: false,
      hasCredentials: true,
    };
  }

  if (config.refreshToken) {
    return {
      configured: true,
      oauthComplete: true,
      enabled: conn.status === 'connected',
      displayName: config.displayName || 'unknown',
    };
  }

  return { configured: false, oauthComplete: false, enabled: false };
});
