import type { ModuleContext } from '../../../../back/utils/brain';
import { getToken, getUserId, igGet, igPost } from '../utils';
import type { WatchedHashtag, CapturedMedia } from '../types';

const HASHTAGS_KEY = 'instagram:watched_hashtags';
const CAPTURES_KEY = 'instagram:watched_captures';
// Instagram allows up to 30 unique hashtag searches per 7 days per account
const MAX_HASHTAGS = 30;

export async function watchHashtags(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const action = args.action as string;

  const raw = await ctx.memory.recall(HASHTAGS_KEY) as string | null;
  const hashtags: WatchedHashtag[] = raw ? JSON.parse(raw) : [];

  if (action === 'list') {
    if (!hashtags.length) return 'No hashtags are being monitored.';
    return (
      `Monitored Instagram hashtags (${hashtags.length}/${MAX_HASHTAGS} weekly limit):\n` +
      hashtags
        .map(
          (h) =>
            `• #${h.hashtag} — added ${new Date(h.addedAt).toLocaleDateString()}` +
            (h.lastCheckedAt
              ? `, last checked ${new Date(h.lastCheckedAt).toLocaleString()}`
              : ''),
        )
        .join('\n')
    );
  }

  if (!args.hashtag?.trim()) return 'Please provide a hashtag.';
  const tag = args.hashtag.trim().replace(/^#/, '');

  if (action === 'add') {
    if (hashtags.find((h) => h.hashtag.toLowerCase() === tag.toLowerCase())) {
      return `#${tag} is already being monitored.`;
    }
    hashtags.push({ hashtag: tag, addedAt: new Date().toISOString() });
    await ctx.memory.remember(HASHTAGS_KEY, JSON.stringify(hashtags), 'context');
    return `Now monitoring #${tag} on Instagram. Checks every hour.\n⚠️ Instagram allows max 30 unique hashtag searches per 7 days.`;
  }

  if (action === 'remove') {
    const idx = hashtags.findIndex(
      (h) => h.hashtag.toLowerCase() === tag.toLowerCase(),
    );
    if (idx === -1) return `#${tag} is not in the monitoring list.`;
    hashtags.splice(idx, 1);
    await ctx.memory.remember(HASHTAGS_KEY, JSON.stringify(hashtags), 'context');
    return `Stopped monitoring #${tag} on Instagram.`;
  }

  return 'Invalid action. Use "add", "remove", or "list".';
}

export async function getWatchedFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const raw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedMedia[] = raw ? JSON.parse(raw) : [];

  if (args.hashtag) {
    const tag = args.hashtag.replace(/^#/, '').toLowerCase();
    captures = captures.filter((c) => c.hashtag.toLowerCase() === tag);
  }

  const limit = args.limit ?? 20;
  captures = captures.slice(-limit).reverse();

  if (!captures.length)
    return 'No posts captured yet. The system checks every hour.';

  return captures
    .map((c) => {
      const m = c.media;
      const date = new Date(m.timestamp).toLocaleString();
      const caption = m.caption
        ? m.caption.slice(0, 100) + (m.caption.length > 100 ? '...' : '')
        : '(no caption)';
      return `**#${c.hashtag}** — ${date}\n${caption}\n❤️ ${m.likeCount}  💬 ${m.commentsCount}\n🔗 ${m.permalink}`;
    })
    .join('\n\n---\n\n');
}

export async function runHashtagWatch(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [token, userId] = await Promise.all([getToken(ctx), getUserId(ctx)]);

  const raw = await ctx.memory.recall(HASHTAGS_KEY) as string | null;
  const hashtags: WatchedHashtag[] = raw ? JSON.parse(raw) : [];

  if (!hashtags.length) return 'No Instagram hashtags to monitor.';

  const capturesRaw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedMedia[] = capturesRaw ? JSON.parse(capturesRaw) : [];
  const existingIds = new Set(captures.map((c) => c.media.id));
  let newCount = 0;

  for (const wh of hashtags) {
    try {
      // Resolve hashtag ID if not cached
      if (!wh.hashtagId) {
        const searchData = await igGet<{ data: Array<{ id: string }> }>(
          '/ig_hashtag_search',
          token,
          { user_id: userId, q: wh.hashtag },
        );
        wh.hashtagId = searchData.data?.[0]?.id;
      }

      if (!wh.hashtagId) {
        ctx.log.error(
          `Instagram: could not resolve hashtag ID for #${wh.hashtag}`,
        );
        continue;
      }

      const mediaData = await igGet<{ data: any[] }>(
        `/${wh.hashtagId}/top_media`,
        token,
        {
          user_id: userId,
          fields:
            'id,media_url,caption,permalink,timestamp,like_count,comments_count',
        },
      );

      for (const m of mediaData.data ?? []) {
        if (!existingIds.has(m.id)) {
          captures.push({
            hashtag: wh.hashtag,
            media: {
              id: m.id,
              mediaUrl: m.media_url,
              caption: m.caption,
              permalink: m.permalink,
              timestamp: m.timestamp,
              likeCount: m.like_count ?? 0,
              commentsCount: m.comments_count ?? 0,
            },
            capturedAt: new Date().toISOString(),
          });
          existingIds.add(m.id);
          newCount++;
        }
      }

      wh.lastCheckedAt = new Date().toISOString();
    } catch (err) {
      ctx.log.error(`Instagram watch error for #${wh.hashtag}: ${err}`);
    }
  }

  if (captures.length > 500) captures = captures.slice(-500);

  await ctx.memory.remember(HASHTAGS_KEY, JSON.stringify(hashtags), 'context');
  await ctx.memory.remember(CAPTURES_KEY, JSON.stringify(captures), 'context');

  return `Instagram hashtag watch complete. ${newCount} new post(s) captured across ${hashtags.length} hashtag(s).`;
}
