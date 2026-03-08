import type { ModuleContext } from '../../../back/utils/brain';
import type { MastodonStatus } from './types';

export async function getInstanceUrl(ctx: ModuleContext): Promise<string> {
  const url = await ctx.brain.getConfig('api.mastodon.instanceUrl');
  if (!url) {
    throw new Error(
      'Mastodon instance URL not configured. Please connect your Mastodon account in the APIs page.',
    );
  }
  return url.replace(/\/$/, '');
}

export async function getToken(ctx: ModuleContext): Promise<string> {
  const token = await ctx.brain.getConfig('api.mastodon.accessToken');
  if (!token) {
    throw new Error(
      'Mastodon credentials not configured. Please connect your Mastodon account in the APIs page.',
    );
  }
  return token;
}

export async function mastoGet<T = any>(
  instanceUrl: string,
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${instanceUrl}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mastodon API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export async function mastoPost<T = any>(
  instanceUrl: string,
  path: string,
  token: string,
  body: Record<string, any>,
): Promise<T> {
  const resp = await fetch(`${instanceUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mastodon API error ${resp.status}: ${err}`);
  }

  const text = await resp.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function mastoDelete<T = any>(
  instanceUrl: string,
  path: string,
  token: string,
): Promise<T> {
  const resp = await fetch(`${instanceUrl}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Mastodon API error ${resp.status}: ${err}`);
  }

  const text = await resp.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function formatStatus(s: MastodonStatus): string {
  const date = new Date(s.createdAt).toLocaleString();
  const author = `@${s.account.acct}`;
  const cw = s.spoilerText ? `[CW: ${s.spoilerText}] ` : '';
  const text = cw + stripHtml(s.content);
  return (
    `[${date}] ${author} (${s.account.displayName})\n` +
    `${text}\n` +
    `🔁 ${s.reblogsCount}  ⭐ ${s.favouritesCount}  💬 ${s.repliesCount}\n` +
    `🔗 ${s.url}`
  );
}
