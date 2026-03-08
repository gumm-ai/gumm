import type { ModuleContext } from '../../../../back/utils/brain';
import { getCredentials, signOAuth1 } from '../utils';

const BASE_URL = 'https://api.twitter.com/2';

async function postWithOAuth(
  path: string,
  ctx: ModuleContext,
  body: Record<string, any>,
) {
  const creds = await getCredentials(ctx);
  const url = `${BASE_URL}${path}`;
  const authHeader = await signOAuth1('POST', url, creds);

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

  return resp.json();
}

async function deleteWithOAuth(path: string, ctx: ModuleContext) {
  const creds = await getCredentials(ctx);
  const url = `${BASE_URL}${path}`;
  const authHeader = await signOAuth1('DELETE', url, creds);

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Twitter API error ${resp.status}: ${err}`);
  }

  return resp.json();
}

export async function postTweet(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.text?.trim()) return 'Tweet text is required.';

  const text = args.text.trim();
  if (text.length > 280) {
    return `Tweet is too long (${text.length} chars). Maximum is 280 characters.`;
  }

  const body: Record<string, any> = { text };
  if (args.replyToId) {
    body['reply'] = { in_reply_to_tweet_id: args.replyToId };
  }

  const data = await postWithOAuth('/tweets', ctx, body);
  const tweetId = data?.data?.id;
  const url = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : '';

  return `Tweet posted successfully! ${url}`;
}

export async function replyToTweet(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.tweetId) return 'tweetId is required.';
  if (!args.text?.trim()) return 'Reply text is required.';

  const text = args.text.trim();
  if (text.length > 280) {
    return `Reply is too long (${text.length} chars). Maximum is 280 characters.`;
  }

  const data = await postWithOAuth('/tweets', ctx, {
    text,
    reply: { in_reply_to_tweet_id: args.tweetId },
  });

  const tweetId = data?.data?.id;
  const url = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : '';

  return `Reply posted successfully! ${url}`;
}

export async function likeTweet(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.tweetId) return 'tweetId is required.';

  const creds = await getCredentials(ctx);
  if (!creds.userId) {
    throw new Error(
      'Twitter user ID not configured. Please reconnect your account.',
    );
  }

  if (args.unlike) {
    await deleteWithOAuth(`/users/${creds.userId}/likes/${args.tweetId}`, ctx);
    return `Tweet ${args.tweetId} unliked.`;
  }

  await postWithOAuth(`/users/${creds.userId}/likes`, ctx, {
    tweet_id: args.tweetId,
  });

  return `Tweet ${args.tweetId} liked! ❤️`;
}

export async function retweetTweet(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.tweetId) return 'tweetId is required.';

  const creds = await getCredentials(ctx);
  if (!creds.userId) {
    throw new Error(
      'Twitter user ID not configured. Please reconnect your account.',
    );
  }

  await postWithOAuth(`/users/${creds.userId}/retweets`, ctx, {
    tweet_id: args.tweetId,
  });

  return `Tweet ${args.tweetId} retweeted! 🔁`;
}
