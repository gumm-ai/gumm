/**
 * GET /api/ytmusic/status
 *
 * Returns the current YouTube Music connection status.
 * Checks the ytmusic connection first, then falls back to the Google connection.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  // Check ytmusic connection first
  let [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'ytmusic'));

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
      channelName: config.channelName || 'unknown',
    };
  }

  return { configured: false, oauthComplete: false, enabled: false };
});
