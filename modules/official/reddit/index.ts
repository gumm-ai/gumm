/**
 * Reddit module
 *
 * Tools:
 *   - reddit_get_feed      : browse subreddit (hot/new/top/rising)
 *   - reddit_search        : search posts by keyword
 *   - reddit_post          : submit a post (text or link)
 *   - reddit_comment       : comment on a post or reply to a comment
 *   - reddit_vote          : upvote / downvote
 *   - reddit_get_comments  : get comments for a post
 *   - reddit_watch         : manage subreddit monitoring
 *   - reddit_get_watched   : get captured posts from monitoring
 *   - reddit_run_monitor   : scheduled hourly monitoring handler
 *
 * Requires Reddit OAuth credentials (client_id + client_secret + refresh_token).
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
    return `Reddit error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
