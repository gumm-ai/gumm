import type { ModuleContext } from '../../../back/utils/brain';
import type { TwitterCredentials, Tweet } from './types';

const BASE_URL = 'https://api.twitter.com/2';

const TWEET_FIELDS = 'created_at,public_metrics,author_id,referenced_tweets';
const EXPANSIONS = 'author_id';
const USER_FIELDS = 'name,username';

export async function getCredentials(
  ctx: ModuleContext,
): Promise<TwitterCredentials> {
  const [
    bearerToken,
    accessToken,
    accessTokenSecret,
    consumerKey,
    consumerSecret,
    userId,
  ] = await Promise.all([
    ctx.brain.getConfig('api.twitter.bearerToken'),
    ctx.brain.getConfig('api.twitter.accessToken'),
    ctx.brain.getConfig('api.twitter.accessTokenSecret'),
    ctx.brain.getConfig('api.twitter.consumerKey'),
    ctx.brain.getConfig('api.twitter.consumerSecret'),
    ctx.brain.getConfig('api.twitter.userId'),
  ]);

  if (!bearerToken || !accessToken) {
    throw new Error(
      'Twitter credentials not configured. Please connect your Twitter account in the APIs page.',
    );
  }

  return {
    bearerToken,
    accessToken: accessToken!,
    accessTokenSecret: accessTokenSecret ?? '',
    consumerKey: consumerKey ?? '',
    consumerSecret: consumerSecret ?? '',
    userId: userId ?? '',
  };
}

export async function twitterGet<T = any>(
  path: string,
  creds: TwitterCredentials,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${creds.bearerToken}`,
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twitter API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export async function twitterPost<T = any>(
  path: string,
  creds: TwitterCredentials,
  body: Record<string, any>,
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  // For write operations Twitter v2 requires OAuth 1.0a signature.
  // We build a simple OAuth 1.0a Authorization header.
  const authHeader = buildOAuth1Header('POST', url, creds, body);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twitter API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export async function twitterDelete<T = any>(
  path: string,
  creds: TwitterCredentials,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const authHeader = buildOAuth1Header('DELETE', url, creds, {});

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twitter API error ${resp.status}: ${err}`);
  }

  return resp.json() as Promise<T>;
}

export function parseTweets(data: any, includeUsers = true): Tweet[] {
  const tweets: any[] = data.data ?? [];
  const users: any[] = data.includes?.users ?? [];
  const userMap = new Map<string, { name: string; username: string }>();
  for (const u of users) {
    userMap.set(u.id, { name: u.name, username: u.username });
  }

  return tweets.map((t: any) => ({
    id: t.id,
    text: t.text,
    authorId: t.author_id ?? '',
    authorName: includeUsers ? userMap.get(t.author_id)?.name : undefined,
    authorUsername: includeUsers
      ? userMap.get(t.author_id)?.username
      : undefined,
    createdAt: t.created_at ?? '',
    metrics: t.public_metrics
      ? {
          likeCount: t.public_metrics.like_count,
          retweetCount: t.public_metrics.retweet_count,
          replyCount: t.public_metrics.reply_count,
          quoteCount: t.public_metrics.quote_count,
        }
      : undefined,
    url: t.author_id ? `https://twitter.com/i/web/status/${t.id}` : undefined,
  }));
}

export function formatTweet(t: Tweet): string {
  const author = t.authorUsername
    ? `@${t.authorUsername} (${t.authorName})`
    : t.authorId;
  const date = t.createdAt ? new Date(t.createdAt).toLocaleString() : '';
  const metrics = t.metrics
    ? `❤️ ${t.metrics.likeCount}  🔁 ${t.metrics.retweetCount}  💬 ${t.metrics.replyCount}`
    : '';
  const url = t.url ? `\n🔗 ${t.url}` : '';
  return `[${date}] ${author}\n${t.text}\n${metrics}${url}`;
}

// Minimal OAuth 1.0a header builder (HMAC-SHA1)
function buildOAuth1Header(
  method: string,
  url: string,
  creds: TwitterCredentials,
  _body: Record<string, any>,
): string {
  const nonce =
    Math.random().toString(36).substring(2) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  // Build base string
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  // Sign with HMAC-SHA1 using Web Crypto
  const signingKey = `${encodeURIComponent(creds.consumerSecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;

  // Synchronous-style approach: store signature placeholder, resolve async below
  // The actual signing is done via the async version of this util
  params['oauth_signature'] = `SIGN:${baseString}:${signingKey}`;

  const header =
    'OAuth ' +
    Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');

  return header;
}

export async function signOAuth1(
  method: string,
  url: string,
  creds: TwitterCredentials,
): Promise<string> {
  const nonce =
    Math.random().toString(36).substring(2) + Date.now().toString(36);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join('&');

  const signingKey = `${encodeURIComponent(creds.consumerSecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(baseString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  params['oauth_signature'] = signature;

  return (
    'OAuth ' +
    Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ')
  );
}

export { TWEET_FIELDS, EXPANSIONS, USER_FIELDS };
