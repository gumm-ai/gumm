/**
 * GET /api/spotify/callback
 *
 * OAuth callback — Spotify redirects here after user consent.
 * Exchanges the authorization code for access + refresh tokens,
 * saves everything in the api_connections registry,
 * and redirects to the dashboard.
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

  const [conn] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, 'spotify'));

  if (!conn) {
    return sendRedirect(event, '/apis?error=spotify_not_configured');
  }

  const config = decryptConfig(conn.config);

  const brain = useBrain();
  await brain.ready();
  const redirectUri = await brain.getConfig('spotify.redirectUri');

  if (!config.clientId || !config.clientSecret || !redirectUri) {
    return sendRedirect(event, '/apis?error=missing_credentials');
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[Spotify OAuth] Token exchange failed:', err);
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('Token exchange failed')}`,
      );
    }

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error('[Spotify OAuth] No refresh_token in response');
      return sendRedirect(
        event,
        `/apis?error=${encodeURIComponent('No refresh token received. Try disconnecting and reconnecting.')}`,
      );
    }

    // Fetch Spotify user profile
    let displayName = 'unknown';
    let email = '';
    try {
      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        displayName = profile.display_name || profile.id || 'unknown';
        email = profile.email || '';
      }
    } catch {
      // Non-critical
    }

    const updatedConfig = {
      ...config,
      refreshToken: tokenData.refresh_token,
      displayName,
      ...(email && { email }),
    };

    const now = new Date();
    await useDrizzle()
      .update(apiConnections)
      .set({
        config: encryptConfig(updatedConfig),
        status: 'connected',
        error: null,
        lastTestedAt: now,
        updatedAt: now,
      })
      .where(eq(apiConnections.id, 'spotify'));

    brain.events
      .emit('spotify', 'spotify.connected', { displayName })
      .catch(() => {});

    return sendRedirect(
      event,
      `/apis?success=true&provider=spotify&name=${encodeURIComponent(displayName)}`,
    );
  } catch (err: any) {
    console.error('[Spotify OAuth] Callback error:', err);
    return sendRedirect(
      event,
      `/apis?error=${encodeURIComponent(err.message || 'Unknown error')}`,
    );
  }
});
