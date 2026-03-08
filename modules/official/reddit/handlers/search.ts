import type { ModuleContext } from '../../../../back/utils/brain';
import { getAccessToken, redditFetch, parsePost, formatPost } from '../utils';

export async function searchPosts(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getAccessToken(ctx);

  if (!args.query?.trim()) return 'Please provide a search query.';

  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const params: Record<string, string> = {
    q: args.query.trim(),
    sort: args.sort ?? 'relevance',
    t: args.timeFilter ?? 'all',
    limit: limit.toString(),
    type: 'link',
  };

  const path = args.subreddit
    ? `/r/${args.subreddit}/search.json`
    : '/search.json';

  if (args.subreddit) params['restrict_sr'] = 'true';

  const data = await redditFetch(path, token, params);
  const children: any[] = data?.data?.children ?? [];

  if (!children.length) return `No posts found for "${args.query}".`;

  const posts = children.map((c) => parsePost(c));
  return (
    `Found ${posts.length} post(s) for "${args.query}":\n\n` +
    posts.map(formatPost).join('\n\n---\n\n')
  );
}
