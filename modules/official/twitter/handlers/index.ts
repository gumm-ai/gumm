import type { ModuleContext } from '../../../../back/utils/brain';
import { getTimeline, getMentions } from './timeline';
import { searchTweets } from './search';
import { postTweet, replyToTweet, likeTweet, retweetTweet } from './publish';
import { watchKeywords, getWatchedFeed, runKeywordWatch } from './monitoring';

export { getTimeline, getMentions, searchTweets };
export { postTweet, replyToTweet, likeTweet, retweetTweet };
export { watchKeywords, getWatchedFeed, runKeywordWatch };

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'twitter_get_timeline':
      return getTimeline(args, ctx);
    case 'twitter_search':
      return searchTweets(args, ctx);
    case 'twitter_post_tweet':
      return postTweet(args, ctx);
    case 'twitter_reply':
      return replyToTweet(args, ctx);
    case 'twitter_like':
      return likeTweet(args, ctx);
    case 'twitter_retweet':
      return retweetTweet(args, ctx);
    case 'twitter_get_mentions':
      return getMentions(args, ctx);
    case 'twitter_watch_keywords':
      return watchKeywords(args, ctx);
    case 'twitter_get_watched_feed':
      return getWatchedFeed(args, ctx);
    case 'twitter_run_keyword_watch':
      return runKeywordWatch(args, ctx);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
