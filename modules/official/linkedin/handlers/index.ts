import type { ModuleContext } from '../../../../back/utils/brain';
import { getFeed, getProfile } from './feed';
import { publishPost, commentOnPost, reactToPost } from './publish';
import { watchKeywords, getWatchedFeed, runDigest } from './monitoring';

export { getFeed, getProfile };
export { publishPost, commentOnPost, reactToPost };
export { watchKeywords, getWatchedFeed, runDigest };

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'linkedin_get_feed':
      return getFeed(args, ctx);
    case 'linkedin_get_profile':
      return getProfile(args, ctx);
    case 'linkedin_post':
      return publishPost(args, ctx);
    case 'linkedin_comment':
      return commentOnPost(args, ctx);
    case 'linkedin_react':
      return reactToPost(args, ctx);
    case 'linkedin_watch_keywords':
      return watchKeywords(args, ctx);
    case 'linkedin_get_watched_feed':
      return getWatchedFeed(args, ctx);
    case 'linkedin_run_digest':
      return runDigest(args, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
