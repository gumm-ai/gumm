import type { ModuleContext } from '../../../back/utils/brain';
import { YT_API, TOKEN_URL } from './constants';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Get the base dashboard URL from webhook configuration
 */
export async function getDashboardUrl(ctx: ModuleContext): Promise<string> {
  const webhookUrl = await ctx.brain.getConfig('telegram.webhookUrl');
  if (webhookUrl) {
    return webhookUrl.replace(/\/api\/telegram\/webhook$/, '');
  }
  return '';
}

/**
 * Get a valid Google access token for YouTube API
 * Tries ytmusic-specific connection first, falls back to google connection
 */
export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  let refreshToken = await ctx.brain.getConfig('api.ytmusic.refreshToken');
  let clientId = await ctx.brain.getConfig('api.ytmusic.clientId');
  let clientSecret = await ctx.brain.getConfig('api.ytmusic.clientSecret');

  if (!refreshToken || !clientId || !clientSecret) {
    refreshToken = await ctx.brain.getConfig('api.google.refreshToken');
    clientId = await ctx.brain.getConfig('api.google.clientId');
    clientSecret = await ctx.brain.getConfig('api.google.clientSecret');
  }

  if (!refreshToken || !clientId || !clientSecret) {
    const base = await getDashboardUrl(ctx);
    throw new Error(
      'ACTION REQUIRED — share this with the user: ' +
        'YouTube Music is not connected yet. ' +
        `Ask the user to connect it here: ${base}/apis — include this link in your response.`,
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (err.includes('invalid_grant')) {
      const base = await getDashboardUrl(ctx);
      throw new Error(
        'ACTION REQUIRED — share this with the user: ' +
          'The YouTube Music connection has expired. ' +
          `Ask the user to reconnect it here: ${base}/apis — include this link in your response.`,
      );
    }
    throw new Error(`Failed to refresh Google access token: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Make an authenticated request to the YouTube Data API
 */
export async function ytFetch(
  ctx: ModuleContext,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const token = await getAccessToken(ctx);
  const separator = path.includes('?') ? '&' : '?';
  const url = `${YT_API}${path}${separator}access_token=${token}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[YouTube Music] API error ${res.status}:`, err);

    if (
      res.status === 403 &&
      (err.includes('accessNotConfigured') ||
        err.includes('API has not been used') ||
        err.includes('it is disabled') ||
        err.includes('has not been enabled'))
    ) {
      throw new Error(
        'ACTION REQUIRED — share this with the user: ' +
          'The YouTube Data API v3 is not enabled. ' +
          'Ask the user to enable it by visiting: https://console.cloud.google.com/apis/library/youtube.googleapis.com ' +
          '— include this link in your response.',
      );
    }

    if (res.status === 403 && err.includes('insufficientPermissions')) {
      const base = await getDashboardUrl(ctx);
      throw new Error(
        'ACTION REQUIRED — share this with the user: ' +
          'YouTube Music permissions are missing. ' +
          `Ask the user to reconnect YouTube Music here: ${base}/apis — include this link in your response.`,
      );
    }

    if (res.status === 403) {
      const base = await getDashboardUrl(ctx);
      throw new Error(
        'ACTION REQUIRED — share this with the user: ' +
          'YouTube Music access was denied (403). This usually means the YouTube scopes are not authorized. ' +
          `Ask the user to reconnect YouTube Music here: ${base}/apis — include this link in your response.`,
      );
    }

    throw new Error(`YouTube API error (${res.status}): ${err}`);
  }

  return res.json();
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Format a YouTube video item for response
 */
export function formatVideo(item: any): Record<string, any> {
  const snippet = item.snippet || {};
  const id =
    typeof item.id === 'string'
      ? item.id
      : item.id?.videoId || item.contentDetails?.videoId;

  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    description: snippet.description?.slice(0, 200),
    publishedAt: snippet.publishedAt,
    videoId: id,
    url: id ? `https://music.youtube.com/watch?v=${id}` : undefined,
    thumbnail:
      snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
  };
}

/**
 * Format a YouTube playlist for response
 */
export function formatPlaylist(item: any): Record<string, any> {
  const snippet = item.snippet || {};
  return {
    title: snippet.title,
    description: snippet.description?.slice(0, 200),
    playlistId: item.id,
    channel: snippet.channelTitle,
    itemCount: item.contentDetails?.itemCount,
    publishedAt: snippet.publishedAt,
    thumbnail:
      snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
    url: `https://music.youtube.com/playlist?list=${item.id}`,
  };
}

/**
 * Format a playlist item for response
 */
export function formatPlaylistItem(item: any): Record<string, any> {
  const snippet = item.snippet || {};
  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    videoId: snippet.resourceId?.videoId,
    position: snippet.position,
    addedAt: snippet.publishedAt,
    url: snippet.resourceId?.videoId
      ? `https://music.youtube.com/watch?v=${snippet.resourceId.videoId}`
      : undefined,
    thumbnail:
      snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
  };
}

/**
 * Format ISO 8601 duration to human readable format
 */
export function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const h = match[1] ? `${match[1]}:` : '';
  const m = (match[2] || '0').padStart(h ? 2 : 1, '0');
  const s = (match[3] || '0').padStart(2, '0');
  return `${h}${m}:${s}`;
}
