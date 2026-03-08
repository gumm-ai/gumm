import type { ModuleContext } from '../../../../back/utils/brain';
import { getAccessToken, redditFetch, parsePost, formatPost } from '../utils';
import type { WatchEntry, CapturedPost } from '../types';

const WATCHES_KEY = 'reddit:watches';
const CAPTURES_KEY = 'reddit:captures';

export async function watchSubreddit(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const action = args.action as string;

  const raw = await ctx.memory.recall(WATCHES_KEY) as string | null;
  const watches: WatchEntry[] = raw ? JSON.parse(raw) : [];

  if (action === 'list') {
    if (!watches.length) return 'No subreddits are being monitored.';
    return (
      `Monitored communities (${watches.length}):\n` +
      watches
        .map((w) => {
          const kw = w.keyword ? ` (keyword: "${w.keyword}")` : '';
          const checked = w.lastCheckedAt
            ? `, last checked ${new Date(w.lastCheckedAt).toLocaleString()}`
            : '';
          return `• r/${w.subreddit}${kw}${checked}`;
        })
        .join('\n')
    );
  }

  if (!args.subreddit) return 'Please provide a subreddit name.';
  const sub = args.subreddit.toLowerCase();

  if (action === 'add') {
    const exists = watches.find(
      (w) => w.subreddit === sub && (w.keyword ?? '') === (args.keyword ?? ''),
    );
    if (exists) return `r/${sub} is already being monitored.`;

    watches.push({
      subreddit: sub,
      keyword: args.keyword || undefined,
      addedAt: new Date().toISOString(),
    });
    await ctx.memory.remember(WATCHES_KEY, JSON.stringify(watches), 'context');

    const kw = args.keyword ? ` for keyword "${args.keyword}"` : '';
    return `Now monitoring r/${sub}${kw}. Checks every hour.`;
  }

  if (action === 'remove') {
    const idx = watches.findIndex(
      (w) => w.subreddit === sub && (w.keyword ?? '') === (args.keyword ?? ''),
    );
    if (idx === -1) return `r/${sub} is not in the monitoring list.`;
    watches.splice(idx, 1);
    await ctx.memory.remember(WATCHES_KEY, JSON.stringify(watches), 'context');
    return `Stopped monitoring r/${sub}.`;
  }

  return 'Invalid action. Use "add", "remove", or "list".';
}

export async function getWatched(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const raw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedPost[] = raw ? JSON.parse(raw) : [];

  if (args.subreddit) {
    captures = captures.filter(
      (c) => c.post.subreddit.toLowerCase() === args.subreddit.toLowerCase(),
    );
  }

  const limit = args.limit ?? 20;
  captures = captures.slice(-limit).reverse();

  if (!captures.length)
    return 'No posts captured yet. The system checks every hour.';

  return captures
    .map((c) => `[Watch: r/${c.post.subreddit}]\n${formatPost(c.post)}`)
    .join('\n\n---\n\n');
}

export async function runMonitor(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getAccessToken(ctx);

  const raw = await ctx.memory.recall(WATCHES_KEY) as string | null;
  const watches: WatchEntry[] = raw ? JSON.parse(raw) : [];

  if (!watches.length) return 'No subreddits to monitor.';

  const capturesRaw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedPost[] = capturesRaw ? JSON.parse(capturesRaw) : [];
  const existingIds = new Set(captures.map((c) => c.post.id));

  let newCount = 0;

  for (const w of watches) {
    try {
      const params: Record<string, string> = { limit: '25', sort: 'new' };
      if (w.lastPostFullname) params['before'] = w.lastPostFullname;

      const path = w.keyword
        ? `/r/${w.subreddit}/search.json`
        : `/r/${w.subreddit}/new.json`;

      if (w.keyword) {
        params['q'] = w.keyword;
        params['restrict_sr'] = 'true';
        params['sort'] = 'new';
      }

      const data = await redditFetch(path, token, params);
      const children: any[] = data?.data?.children ?? [];

      for (const child of children) {
        const post = parsePost(child);
        if (!existingIds.has(post.id)) {
          captures.push({
            watchKey: `r/${w.subreddit}${w.keyword ? `:${w.keyword}` : ''}`,
            post,
            capturedAt: new Date().toISOString(),
          });
          existingIds.add(post.id);
          newCount++;
        }
      }

      w.lastCheckedAt = new Date().toISOString();
      if (children.length > 0) {
        w.lastPostFullname = children[0]!.data.name;
      }
    } catch (err) {
      ctx.log.error(`Reddit monitor error for r/${w.subreddit}: ${err}`);
    }
  }

  // Keep last 500 captures
  if (captures.length > 500) captures = captures.slice(-500);

  await ctx.memory.remember(WATCHES_KEY, JSON.stringify(watches), 'context');
  await ctx.memory.remember(CAPTURES_KEY, JSON.stringify(captures), 'context');

  return `Reddit monitor complete. ${newCount} new post(s) captured across ${watches.length} watch(es).`;
}
