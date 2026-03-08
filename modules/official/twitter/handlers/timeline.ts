import type { ModuleContext } from '../../../../back/utils/brain';
import {
  getCredentials,
  twitterGet,
  signOAuth1,
  parseTweets,
  formatTweet,
  TWEET_FIELDS,
  EXPANSIONS,
  USER_FIELDS,
} from '../utils';

export async function getTimeline(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const creds = await getCredentials(ctx);

  if (!creds.userId) {
    throw new Error(
      'Twitter user ID not configured. Please reconnect your account.',
    );
  }

  const maxResults = Math.min(
    Math.max(args.maxResults ?? 20, 1),
    100,
  ).toString();
  const params: Record<string, string> = {
    max_results: maxResults,
    'tweet.fields': TWEET_FIELDS,
    expansions: EXPANSIONS,
    'user.fields': USER_FIELDS,
  };
  if (args.sinceId) params['since_id'] = args.sinceId;

  const data = await twitterGet(
    `/users/${creds.userId}/timelines/reverse_chronological`,
    creds,
    params,
  );

  const tweets = parseTweets(data);
  if (!tweets.length) return 'No tweets found in your timeline.';

  return tweets.map(formatTweet).join('\n\n---\n\n');
}

export async function getMentions(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const creds = await getCredentials(ctx);

  if (!creds.userId) {
    throw new Error(
      'Twitter user ID not configured. Please reconnect your account.',
    );
  }

  const maxResults = Math.min(
    Math.max(args.maxResults ?? 20, 1),
    100,
  ).toString();
  const params: Record<string, string> = {
    max_results: maxResults,
    'tweet.fields': TWEET_FIELDS,
    expansions: EXPANSIONS,
    'user.fields': USER_FIELDS,
  };
  if (args.sinceId) params['since_id'] = args.sinceId;

  const data = await twitterGet(
    `/users/${creds.userId}/mentions`,
    creds,
    params,
  );

  const tweets = parseTweets(data);
  if (!tweets.length) return 'No mentions found.';

  return (
    `You have ${tweets.length} mention(s):\n\n` +
    tweets.map(formatTweet).join('\n\n---\n\n')
  );
}
