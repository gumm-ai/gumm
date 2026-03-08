import type { ModuleContext } from '../../../../back/utils/brain';
import {
  getCredentials,
  twitterGet,
  parseTweets,
  formatTweet,
  TWEET_FIELDS,
  EXPANSIONS,
  USER_FIELDS,
} from '../utils';

export async function searchTweets(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const creds = await getCredentials(ctx);

  if (!args.query?.trim()) {
    return 'Please provide a search query.';
  }

  const maxResults = Math.min(
    Math.max(args.maxResults ?? 20, 10),
    100,
  ).toString();
  const params: Record<string, string> = {
    query: args.query.trim(),
    max_results: maxResults,
    'tweet.fields': TWEET_FIELDS,
    expansions: EXPANSIONS,
    'user.fields': USER_FIELDS,
  };
  if (args.sinceId) params['since_id'] = args.sinceId;

  const data = await twitterGet('/tweets/search/recent', creds, params);

  const tweets = parseTweets(data);
  if (!tweets.length) return `No tweets found for "${args.query}".`;

  return (
    `Found ${data.meta?.result_count ?? tweets.length} tweet(s) for "${args.query}":\n\n` +
    tweets.map(formatTweet).join('\n\n---\n\n')
  );
}
