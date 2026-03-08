/**
 * Twitter / X module
 *
 * Tools:
 *   - twitter_get_timeline     : home timeline
 *   - twitter_search           : search recent tweets by keyword/hashtag
 *   - twitter_post_tweet       : post a new tweet
 *   - twitter_reply            : reply to a tweet
 *   - twitter_like             : like / unlike a tweet
 *   - twitter_retweet          : retweet
 *   - twitter_get_mentions     : get mentions
 *   - twitter_watch_keywords   : manage keyword/hashtag monitoring list
 *   - twitter_get_watched_feed : get captured tweets from monitoring
 *   - twitter_run_keyword_watch: scheduled keyword check (runs every 30 min)
 *
 * Requires Twitter API v2 credentials (Bearer token + OAuth 1.0a keys).
 */

import type { ModuleContext } from '../../../back/utils/brain';
export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) return 'Module context required';
  try {
    return await routeHandler(toolName, args, ctx);
  } catch (err) {
    return `Twitter error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
