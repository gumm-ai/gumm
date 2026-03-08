/**
 * Instagram module
 *
 * Tools:
 *   - instagram_get_media         : get your latest posts
 *   - instagram_get_insights      : engagement stats for a post
 *   - instagram_get_comments      : get comments on a post
 *   - instagram_post_image        : publish a photo (requires public image URL)
 *   - instagram_post_carousel     : publish a multi-image carousel
 *   - instagram_reply_comment     : reply to a comment
 *   - instagram_watch_hashtags    : manage hashtag monitoring
 *   - instagram_get_watched_feed  : get captured posts from monitoring
 *   - instagram_run_hashtag_watch : scheduled hourly monitoring handler
 *
 * Requires Instagram Graph API (Pro/Creator account + Facebook Page).
 * Note: Instagram limits hashtag searches to 30 unique hashtags per 7 days.
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
    return `Instagram error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
