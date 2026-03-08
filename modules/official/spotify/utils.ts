import type { ModuleContext } from '../../../back/utils/brain';
import { SPOTIFY_API, TOKEN_URL } from './constants';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Get a valid Spotify access token using refresh token
 */
export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  const refreshToken = await ctx.brain.getConfig('api.spotify.refreshToken');
  const clientId = await ctx.brain.getConfig('api.spotify.clientId');
  const clientSecret = await ctx.brain.getConfig('api.spotify.clientSecret');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Spotify not configured. Please connect Spotify in the APIs page and complete OAuth.',
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Spotify access token: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Make an authenticated request to the Spotify API
 */
export async function spotifyFetch(
  ctx: ModuleContext,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const token = await getAccessToken(ctx);
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify API error (${res.status}): ${err}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Format milliseconds duration to human readable format
 */
export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format a Spotify track for response
 */
export function formatTrack(t: any): Record<string, any> {
  return {
    name: t.name,
    artists: t.artists?.map((a: any) => a.name).join(', '),
    album: t.album?.name,
    duration: formatDuration(t.duration_ms),
    uri: t.uri,
    id: t.id,
    popularity: t.popularity,
    previewUrl: t.preview_url,
    externalUrl: t.external_urls?.spotify,
  };
}

/**
 * Format a Spotify artist for response
 */
export function formatArtist(a: any): Record<string, any> {
  return {
    name: a.name,
    genres: a.genres?.join(', '),
    followers: a.followers?.total,
    popularity: a.popularity,
    uri: a.uri,
    id: a.id,
    externalUrl: a.external_urls?.spotify,
  };
}

/**
 * Format a Spotify album for response
 */
export function formatAlbum(a: any): Record<string, any> {
  return {
    name: a.name,
    artists: a.artists?.map((ar: any) => ar.name).join(', '),
    releaseDate: a.release_date,
    totalTracks: a.total_tracks,
    uri: a.uri,
    id: a.id,
    externalUrl: a.external_urls?.spotify,
  };
}

/**
 * Format a Spotify playlist for response
 */
export function formatPlaylist(p: any): Record<string, any> {
  return {
    name: p.name,
    description: p.description,
    id: p.id,
    uri: p.uri,
    totalTracks: p.tracks?.total,
    owner: p.owner?.display_name,
    public: p.public,
    externalUrl: p.external_urls?.spotify,
  };
}
