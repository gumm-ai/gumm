/**
 * Mastodon module
 *
 * Tools:
 *   - mastodon_get_timeline      : home / local / public timeline
 *   - mastodon_search            : search statuses, accounts, hashtags
 *   - mastodon_post              : post a new toot
 *   - mastodon_reply             : reply to a toot
 *   - mastodon_action            : boost, unboost, favourite, unfavourite
 *   - mastodon_get_notifications : get notifications
 *   - mastodon_watch_hashtags    : manage hashtag monitoring
 *   - mastodon_get_watched_feed  : get captured toots from monitoring
 *   - mastodon_run_hashtag_watch : scheduled hashtag check (every 30 min)
 *
 * Works with any Mastodon-compatible instance (mastodon.social, fosstodon.org, etc.).
 * Requires Mastodon OAuth access token and instance URL.
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
    return `Mastodon error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
