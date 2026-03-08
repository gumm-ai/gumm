import type { ModuleContext } from '../../../back/utils/brain';
import type { RedditPost, RedditComment } from './types';

const BASE_URL = 'https://oauth.reddit.com';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';

export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    ctx.brain.getConfig('api.reddit.clientId'),
    ctx.brain.getConfig('api.reddit.clientSecret'),
    ctx.brain.getConfig('api.reddit.refreshToken'),
  ]);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Reddit credentials not configured. Please connect your Reddit account in the APIs page.',
    );
  }

  const creds = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Gumm/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Reddit token refresh failed: ${err}`);
  }

  const data = (await resp.json()) as Record<string, any>;
  return data.access_token as string;
}

async function redditFetch<T = any>(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Gumm/1.0',
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Reddit API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

async function redditPost<T = any>(
  path: string,
  token: string,
  body: Record<string, string>,
): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Gumm/1.0',
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Reddit API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export function parsePost(child: any): RedditPost {
  const d = child.data;
  return {
    id: d.id,
    fullname: d.name,
    title: d.title,
    author: d.author,
    subreddit: d.subreddit,
    text: d.selftext || undefined,
    url: d.url,
    score: d.score,
    numComments: d.num_comments,
    flair: d.link_flair_text || undefined,
    createdAt: d.created_utc,
    isNsfw: d.over_18,
    permalink: `https://reddit.com${d.permalink}`,
  };
}

export function formatPost(p: RedditPost): string {
  const date = new Date(p.createdAt * 1000).toLocaleString();
  const flair = p.flair ? ` [${p.flair}]` : '';
  const nsfw = p.isNsfw ? ' 🔞' : '';
  return (
    `**${p.title}**${flair}${nsfw}\n` +
    `r/${p.subreddit} • u/${p.author} • ${date}\n` +
    `⬆️ ${p.score}  💬 ${p.numComments}\n` +
    `🔗 ${p.permalink}`
  );
}

export { redditFetch, redditPost, parsePost as parsePostRaw };
export { BASE_URL };
