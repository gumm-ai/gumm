import type { ModuleContext } from '../../../back/utils/brain';
import type { LinkedInPost } from './types';

const BASE_URL = 'https://api.linkedin.com';

export async function getToken(ctx: ModuleContext): Promise<string> {
  const token = await ctx.brain.getConfig('api.linkedin.accessToken');
  if (!token) {
    throw new Error(
      'LinkedIn credentials not configured. Please connect your LinkedIn account in the APIs page.',
    );
  }
  return token;
}

export async function getPersonUrn(ctx: ModuleContext): Promise<string> {
  const urn = await ctx.brain.getConfig('api.linkedin.personUrn');
  if (!urn)
    throw new Error(
      'LinkedIn person URN not found. Please reconnect your account.',
    );
  return urn;
}

export async function linkedinGet<T = any>(
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
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LinkedIn API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export async function linkedinPost<T = any>(
  path: string,
  token: string,
  body: Record<string, any>,
): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`LinkedIn API error ${resp.status}: ${err}`);
  }

  // Some endpoints return 201 with body, others return 204 with no body
  const text = await resp.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function formatPost(p: LinkedInPost): string {
  const date = new Date(p.createdAt).toLocaleString();
  const preview = p.text.length > 280 ? p.text.slice(0, 277) + '...' : p.text;
  return (
    `**${p.authorName}**  [${date}]\n` +
    `${preview}\n` +
    `❤️ ${p.likeCount}  💬 ${p.commentCount}` +
    (p.shareUrl ? `\n🔗 ${p.shareUrl}` : '')
  );
}
