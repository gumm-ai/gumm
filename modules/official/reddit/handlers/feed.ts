import type { ModuleContext } from '../../../../back/utils/brain';
import { getAccessToken, redditFetch, parsePost, formatPost } from '../utils';

export async function getFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getAccessToken(ctx);
  const sub = args.subreddit ?? 'all';
  const sort = args.sort ?? 'hot';
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const params: Record<string, string> = { limit: limit.toString() };
  if (sort === 'top' && args.timeFilter) params['t'] = args.timeFilter;

  const data = await redditFetch(`/r/${sub}/${sort}.json`, token, params);
  const children: any[] = data?.data?.children ?? [];

  if (!children.length) return `No posts found in r/${sub}.`;

  const posts = children.map((c) => parsePost(c));
  return posts.map(formatPost).join('\n\n---\n\n');
}

export async function getComments(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getAccessToken(ctx);
  const limit = Math.min(args.limit ?? 10, 50);

  const data = await redditFetch(
    `/r/${args.subreddit}/comments/${args.articleId}.json`,
    token,
    { limit: limit.toString() },
  );

  const commentsListing = data?.[1]?.data?.children ?? [];
  if (!commentsListing.length) return 'No comments found.';

  const lines: string[] = [];
  for (const c of commentsListing) {
    if (c.kind !== 't1') continue;
    const d = c.data;
    const date = new Date(d.created_utc * 1000).toLocaleString();
    lines.push(`u/${d.author} [${date}] ⬆️ ${d.score}\n${d.body}\n`);
  }

  return lines.join('\n---\n\n') || 'No comments.';
}
