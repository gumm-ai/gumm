import type { ModuleContext } from '../../../../back/utils/brain';
import { getMedia, getInsights, getComments } from './media';
import { postImage, postCarousel, replyComment } from './publish';
import { watchHashtags, getWatchedFeed, runHashtagWatch } from './monitoring';

export { getMedia, getInsights, getComments };
export { postImage, postCarousel, replyComment };
export { watchHashtags, getWatchedFeed, runHashtagWatch };

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'instagram_get_media':
      return getMedia(args, ctx);
    case 'instagram_get_insights':
      return getInsights(args, ctx);
    case 'instagram_get_comments':
      return getComments(args, ctx);
    case 'instagram_post_image':
      return postImage(args, ctx);
    case 'instagram_post_carousel':
      return postCarousel(args, ctx);
    case 'instagram_reply_comment':
      return replyComment(args, ctx);
    case 'instagram_watch_hashtags':
      return watchHashtags(args, ctx);
    case 'instagram_get_watched_feed':
      return getWatchedFeed(args, ctx);
    case 'instagram_run_hashtag_watch':
      return runHashtagWatch(args, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
