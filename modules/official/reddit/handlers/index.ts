import type { ModuleContext } from '../../../../back/utils/brain';
import { getFeed, getComments } from './feed';
import { searchPosts } from './search';
import { submitPost, commentPost, votePost } from './publish';
import { watchSubreddit, getWatched, runMonitor } from './monitoring';

export { getFeed, getComments, searchPosts };
export { submitPost, commentPost, votePost };
export { watchSubreddit, getWatched, runMonitor };

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'reddit_get_feed':
      return getFeed(args, ctx);
    case 'reddit_search':
      return searchPosts(args, ctx);
    case 'reddit_post':
      return submitPost(args, ctx);
    case 'reddit_comment':
      return commentPost(args, ctx);
    case 'reddit_vote':
      return votePost(args, ctx);
    case 'reddit_get_comments':
      return getComments(args, ctx);
    case 'reddit_watch':
      return watchSubreddit(args, ctx);
    case 'reddit_get_watched':
      return getWatched(args, ctx);
    case 'reddit_run_monitor':
      return runMonitor(args, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
