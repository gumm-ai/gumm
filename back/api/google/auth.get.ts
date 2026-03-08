/**
 * GET /api/google/auth
 *
 * Redirects the user to Google's OAuth consent screen.
 * Reads credentials from the centralized api_connections registry.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user)
    throw createError({ statusCode: 401, message: 'Unauthorized' });

  // Read Google connection from centralized registry
  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'google'));

  if (!conn) {
    throw createError({
      statusCode: 400,
      message:
        'Google API connection not configured. Add it in the APIs page first.',
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

  // Build the redirect URI from the current request
  const host = getRequestHeader(event, 'host');
  const proto = getRequestHeader(event, 'x-forwarded-proto') || 'http';
  const redirectUri = `${proto}://${host}/api/google/callback`;

  // Store redirect URI for the callback to use
  const brain = useBrain();
  await brain.ready();
  await brain.setConfig('google.redirectUri', redirectUri);

  // Read requested scopes from query (optional), default to Gmail scopes
  const query = getQuery(event);
  const extraScopes =
    (query.scopes as string)?.split(',').filter(Boolean) || [];

  const defaultScopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
  ];

  const scopes = [...new Set([...defaultScopes, ...extraScopes])];

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return sendRedirect(
    event,
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
});
