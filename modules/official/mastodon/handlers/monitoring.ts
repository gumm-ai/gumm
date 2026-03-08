import type { ModuleContext } from '../../../../back/utils/brain';
import { getInstanceUrl, getToken, mastoGet, formatStatus } from '../utils';
import type { WatchedHashtag, CapturedStatus, MastodonStatus } from '../types';

const HASHTAGS_KEY = 'mastodon:watched_hashtags';
const CAPTURES_KEY = 'mastodon:watched_captures';

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
      `Monitored Mastodon hashtags (${hashtags.length}):\n` +
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
    return `Now monitoring #${tag} on Mastodon. Checks every 30 minutes.`;
  }

  if (action === 'remove') {
    const idx = hashtags.findIndex(
      (h) => h.hashtag.toLowerCase() === tag.toLowerCase(),
    );
    if (idx === -1) return `#${tag} is not in the monitoring list.`;
    hashtags.splice(idx, 1);
    await ctx.memory.remember(HASHTAGS_KEY, JSON.stringify(hashtags), 'context');
    return `Stopped monitoring #${tag} on Mastodon.`;
  }

  return 'Invalid action. Use "add", "remove", or "list".';
}

export async function getWatchedFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const raw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedStatus[] = raw ? JSON.parse(raw) : [];

  if (args.hashtag) {
    const tag = args.hashtag.replace(/^#/, '').toLowerCase();
    captures = captures.filter((c) => c.hashtag.toLowerCase() === tag);
  }

  const limit = args.limit ?? 20;
  captures = captures.slice(-limit).reverse();

  if (!captures.length)
    return 'No toots captured yet. The system checks every 30 minutes.';

  const grouped = new Map<string, CapturedStatus[]>();
  for (const c of captures) {
    const arr = grouped.get(c.hashtag) ?? [];
    arr.push(c);
    grouped.set(c.hashtag, arr);
  }

  const lines: string[] = [];
  for (const [tag, items] of grouped) {
    lines.push(`**#${tag}** (${items.length} toot(s)):`);
    for (const item of items) {
      lines.push(formatStatus(item.status));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function runHashtagWatch(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  const raw = await ctx.memory.recall(HASHTAGS_KEY) as string | null;
  const hashtags: WatchedHashtag[] = raw ? JSON.parse(raw) : [];

  if (!hashtags.length) return 'No hashtags to monitor.';

  const capturesRaw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedStatus[] = capturesRaw ? JSON.parse(capturesRaw) : [];
  const existingIds = new Set(captures.map((c) => c.status.id));
  let newCount = 0;

  for (const wh of hashtags) {
    try {
      const params: Record<string, string> = { limit: '20' };
      if (wh.lastStatusId) params['since_id'] = wh.lastStatusId;

      const statuses = await mastoGet<MastodonStatus[]>(
        instanceUrl,
        `/api/v1/timelines/tag/${encodeURIComponent(wh.hashtag)}`,
        token,
        params,
      );

      for (const s of statuses) {
        if (!existingIds.has(s.id)) {
          captures.push({
            hashtag: wh.hashtag,
            status: s,
            capturedAt: new Date().toISOString(),
          });
          existingIds.add(s.id);
          newCount++;
        }
      }

      wh.lastCheckedAt = new Date().toISOString();
      if (statuses.length > 0) {
        wh.lastStatusId = statuses[0]!.id;
      }
    } catch (err) {
      ctx.log.error(`Mastodon watch error for #${wh.hashtag}: ${err}`);
    }
  }

  if (captures.length > 500) captures = captures.slice(-500);

  await ctx.memory.remember(HASHTAGS_KEY, JSON.stringify(hashtags), 'context');
  await ctx.memory.remember(CAPTURES_KEY, JSON.stringify(captures), 'context');

  return `Hashtag watch complete. ${newCount} new toot(s) captured across ${hashtags.length} hashtag(s).`;
}
