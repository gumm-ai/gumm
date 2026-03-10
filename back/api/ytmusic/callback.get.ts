/**
 * GET /api/ytmusic/callback
 *
 * OAuth callback for YouTube Music — Google redirects here after consent.
 * Exchanges code for tokens and stores them in the ytmusic connection
 * (or updates the Google connection with YouTube tokens).
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';
import { decryptConfig, encryptConfig } from '../../utils/connection-crypto';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = query.code as string | undefined;
  const error = query.error as string | undefined;

  if (error) {
    return sendRedirect(event, `/apis?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return sendRedirect(event, '/apis?error=missing_code');
  }

  const brain = useBrain();
  await brain.ready();
  const redirectUri = await brain.getConfig('ytmusic.redirectUri');
  const sourceConnId = await brain.getConfig('ytmusic.sourceConnection');

  // Load the connection that was used during auth
  const connId = sourceConnId || 'ytmusic';
  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, connId));

  if (!conn) {
    return sendRedirect(event, '/apis?error=ytmusic_not_configured');
  }

  const config = decryptConfig(conn.config);

  if (!config.clientId || !config.clientSecret || !redirectUri) {
    return sendRedirect(event, '/apis?error=missing_credentials');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[YTMusic OAuth] Token exchange failed:', err);
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('Token exchange failed')}`,
      );
    }

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error('[YTMusic OAuth] No refresh_token in response');
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('No refresh token received. Try disconnecting and reconnecting.')}`,
      );
    }

    // Fetch channel name from YouTube
    let channelName = 'unknown';
    try {
      const ytRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      if (ytRes.ok) {
        const ytData = await ytRes.json();
        channelName =
          ytData.items?.[0]?.snippet?.title ||
          ytData.items?.[0]?.id ||
          'unknown';
      }
    } catch {
      // Non-critical
    }

    // If we used the Google connection, store YT tokens in a separate ytmusic connection
    // If we used the ytmusic connection directly, update it
    const targetId = 'ytmusic';
    const [existingYt] = await useDrizzle()
      .select()
      .from(apiConnections)
      .where(eq(apiConnections.id, targetId));

    const updatedConfig = {
      ...(existingYt ? decryptConfig(existingYt.config) : config),
      refreshToken: tokenData.refresh_token,
      channelName,
    };

    const now = new Date();

    if (existingYt) {
      await useDrizzle()
        .update(apiConnections)
        .set({
          config: encryptConfig(updatedConfig),
          status: 'connected',
          error: null,
          lastTestedAt: now,
          updatedAt: now,
        })
        .where(eq(apiConnections.id, targetId));
    }

    brain.events
      .emit('ytmusic', 'ytmusic.connected', { channelName })
      .catch(() => {});

    return sendRedirect(
      event,
      `/apis?success=true&provider=ytmusic&name=${encodeURIComponent(channelName)}`,
    );
  } catch (err: any) {
    console.error('[YTMusic OAuth] Callback error:', err);
    return sendRedirect(
      event,
      `/apis?error=${encodeURIComponent(err.message || 'Unknown error')}`,
    );
  }
});
