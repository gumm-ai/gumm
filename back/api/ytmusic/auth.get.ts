/**
 * GET /api/ytmusic/auth
 *
 * Redirects to Google OAuth with YouTube Data API scopes.
 * YouTube Music uses the same Google OAuth infrastructure — this endpoint
 * just ensures the right scopes are requested.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  // YouTube Music can use either its own connection or the Google connection
  let conn = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'ytmusic'))
    .then((r) => r[0]);

  // Fall back to Google connection if ytmusic doesn't have its own credentials
  if (!conn) {
    conn = await useDrizzle()
      .select()
      .from(apiConnections)
      .where(eq(apiConnections.id, 'google'))
      .then((r) => r[0]);
  }

  if (!conn) {
    throw createError({
      statusCode: 400,
      message:
        'No Google or YouTube Music connection found. Add one in the APIs page first.',
    });
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  if (!config.clientId) {
    throw createError({
      statusCode: 400,
      message: 'Google Client ID not configured.',
    });
  }

  const host = getRequestHeader(event, 'host');
  const proto = getRequestHeader(event, 'x-forwarded-proto') || 'http';
  // Reuse the Google callback URI (already registered in Google Cloud Console)
  const redirectUri = `${proto}://${host}/api/google/callback`;

  const brain = useBrain();
  await brain.ready();
  await brain.setConfig('ytmusic.redirectUri', redirectUri);
  // Remember which connection we're using for the callback
  await brain.setConfig('ytmusic.sourceConnection', conn.id);

  const scopes = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
  ];

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: 'ytmusic',
  });

  return sendRedirect(
    event,
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
});
