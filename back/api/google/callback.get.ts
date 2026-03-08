/**
 * GET /api/google/callback
 *
 * OAuth callback — Google redirects here after user consent.
 * Exchanges the authorization code for access + refresh tokens,
 * fetches the user's email, saves everything in the api_connections registry,
 * and redirects to the dashboard.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const code = query.code as string | undefined;
  const error = query.error as string | undefined;
  const state = (query.state as string | undefined) || '';

  if (error) {
    return sendRedirect(event, `/apis?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return sendRedirect(event, '/apis?error=missing_code');
  }

  // YouTube Music OAuth uses this same callback with state=ytmusic
  const isYtMusic = state === 'ytmusic';

  // Read Google connection config (used by both Google and YT Music)
  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'google'));

  if (!conn) {
    return sendRedirect(event, '/apis?error=google_not_configured');
  }

  let config: Record<string, string> = {};
  try {
    config = JSON.parse(conn.config);
  } catch {}

  const brain = useBrain();
  await brain.ready();
  const redirectUri = isYtMusic
    ? await brain.getConfig('ytmusic.redirectUri')
    : await brain.getConfig('google.redirectUri');

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
      console.error(
        `[${isYtMusic ? 'YTMusic' : 'Google'} OAuth] Token exchange failed:`,
        err,
      );
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('Token exchange failed')}`,
      );
    }

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error(
        `[${isYtMusic ? 'YTMusic' : 'Google'} OAuth] No refresh_token in response`,
      );
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('No refresh token received. Try disconnecting and reconnecting.')}`,
      );
    }

    // ── YouTube Music path ─────────────────────────────────────────────
    if (isYtMusic) {
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

      // Store YT tokens in the ytmusic connection
      const [existingYt] = await useDrizzle()
        .select()
        .from(apiConnections)
        .where(eq(apiConnections.id, 'ytmusic'));

      const updatedConfig = {
        ...(existingYt ? JSON.parse(existingYt.config) : config),
        refreshToken: tokenData.refresh_token,
        channelName,
      };

      const now = new Date();
      if (existingYt) {
        await useDrizzle()
          .update(apiConnections)
          .set({
            config: JSON.stringify(updatedConfig),
            status: 'connected',
            error: null,
            lastTestedAt: now,
            updatedAt: now,
          })
          .where(eq(apiConnections.id, 'ytmusic'));
      } else {
        await useDrizzle()
          .insert(apiConnections)
          .values({
            id: 'ytmusic',
            name: 'YouTube Music',
            provider: 'ytmusic',
            authType: 'oauth2',
            config: JSON.stringify(updatedConfig),
            status: 'connected',
            error: null,
            lastTestedAt: now,
            createdAt: now,
            updatedAt: now,
          });
      }

      brain.events
        .emit('ytmusic', 'ytmusic.connected', { channelName })
        .catch(() => {});

      return sendRedirect(
        event,
        `/apis?success=true&provider=ytmusic&name=${encodeURIComponent(channelName)}`,
      );
    }

    // ── Standard Google path ───────────────────────────────────────────
    let email = 'unknown';
    try {
      const profileRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        email = profile.emailAddress || 'unknown';
      }
    } catch {
      // Non-critical
    }

    // Update the Google connection with tokens
    const updatedConfig = {
      ...config,
      refreshToken: tokenData.refresh_token,
      email,
    };

    const now = new Date();
    await useDrizzle()
      .update(apiConnections)
      .set({
        config: JSON.stringify(updatedConfig),
        status: 'connected',
        error: null,
        lastTestedAt: now,
        updatedAt: now,
      })
      .where(eq(apiConnections.id, 'google'));

    brain.events.emit('google', 'google.connected', { email }).catch(() => {});

    return sendRedirect(
      event,
      `/apis?success=true&email=${encodeURIComponent(email)}`,
    );
  } catch (err: any) {
    console.error('[Google OAuth] Callback error:', err.message);
    return sendRedirect(
      event,
      `/apis?error=${encodeURIComponent(err.message)}`,
    );
  }
});
