/**
 * GET /api/spotify/auth
 *
 * Redirects the user to Spotify's OAuth consent screen.
 * Reads credentials from the centralized api_connections registry.
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
    throw createError({
      statusCode: 400,
      message:
        'Spotify connection not configured. Add it in the APIs page first.',
    });
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  if (!config.clientId) {
    throw createError({
      statusCode: 400,
      message: 'Spotify Client ID not configured.',
    });
  }

  const host = getRequestHeader(event, 'host');
  const proto = getRequestHeader(event, 'x-forwarded-proto') || 'http';
  const redirectUri = `${proto}://${host}/api/spotify/callback`;

  const brain = useBrain();
  await brain.ready();
  await brain.setConfig('spotify.redirectUri', redirectUri);

  const scopes = [
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',
  ];

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    show_dialog: 'true',
  });

  return sendRedirect(
    event,
    `https://accounts.spotify.com/authorize?${params}`,
  );
});
