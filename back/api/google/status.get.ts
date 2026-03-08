/**
 * GET /api/google/status
 *
 * Returns the current Google API connection status from the centralized registry.
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
    return { configured: false, oauthComplete: false, enabled: false };
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  // Client ID saved but no refresh token — credentials entered, OAuth not yet done
  if (config.clientId && !config.refreshToken) {
    return {
      configured: false,
      oauthComplete: false,
      enabled: false,
      hasCredentials: true,
    };
  }

  // Fully configured
  if (config.refreshToken) {
    return {
      configured: true,
      oauthComplete: true,
      enabled: conn.status === 'connected',
      email: config.email || 'unknown',
    };
  }

  return { configured: false, oauthComplete: false, enabled: false };
});
