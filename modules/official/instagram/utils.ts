import type { ModuleContext } from '../../../back/utils/brain';
import type { InstagramMedia } from './types';

const GRAPH_BASE = 'https://graph.instagram.com/v19.0';

export async function getToken(ctx: ModuleContext): Promise<string> {
  const token = await ctx.brain.getConfig('api.instagram.accessToken');
  if (!token) {
    throw new Error(
      'Instagram credentials not configured. Please connect your Instagram account in the APIs page.',
    );
  }
  return token;
}

export async function getUserId(ctx: ModuleContext): Promise<string> {
  const userId = await ctx.brain.getConfig('api.instagram.userId');
  if (!userId) {
    throw new Error(
      'Instagram user ID not found. Please reconnect your account in the APIs page.',
    );
  }
  return userId;
}

export async function igGet<T = any>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString());

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Instagram API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export async function igPost<T = any>(
  path: string,
  token: string,
  body: Record<string, any>,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);

  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Instagram API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export function formatMedia(m: InstagramMedia): string {
  const date = new Date(m.timestamp).toLocaleString();
  const caption = m.caption
    ? m.caption.length > 150
      ? m.caption.slice(0, 147) + '...'
      : m.caption
    : '(no caption)';
  const emoji =
    m.mediaType === 'VIDEO'
      ? '🎬'
      : m.mediaType === 'CAROUSEL_ALBUM'
        ? '🖼️'
        : '📷';
  return (
    `${emoji} ${m.mediaType} — ${date}\n` +
    `${caption}\n` +
    `❤️ ${m.likeCount}  💬 ${m.commentsCount}\n` +
    `🔗 ${m.permalink}`
  );
}

const MEDIA_FIELDS =
  'id,media_type,media_url,thumbnail_url,caption,permalink,timestamp,like_count,comments_count';

export { MEDIA_FIELDS, GRAPH_BASE };
