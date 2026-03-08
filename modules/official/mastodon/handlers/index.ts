import type { ModuleContext } from '../../../../back/utils/brain';
import { getTimeline, getNotifications } from './timeline';
import { searchMastodon } from './search';
import { postToot, replyToToot, performAction } from './publish';
import { watchHashtags, getWatchedFeed, runHashtagWatch } from './monitoring';

export { getTimeline, getNotifications, searchMastodon };
export { postToot, replyToToot, performAction };
export { watchHashtags, getWatchedFeed, runHashtagWatch };

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'mastodon_get_timeline':
      return getTimeline(args, ctx);
    case 'mastodon_search':
      return searchMastodon(args, ctx);
    case 'mastodon_post':
      return postToot(args, ctx);
    case 'mastodon_reply':
      return replyToToot(args, ctx);
    case 'mastodon_action':
      return performAction(args, ctx);
    case 'mastodon_get_notifications':
      return getNotifications(args, ctx);
    case 'mastodon_watch_hashtags':
      return watchHashtags(args, ctx);
    case 'mastodon_get_watched_feed':
      return getWatchedFeed(args, ctx);
    case 'mastodon_run_hashtag_watch':
      return runHashtagWatch(args, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
