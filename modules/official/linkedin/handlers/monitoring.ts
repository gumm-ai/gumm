import type { ModuleContext } from '../../../../back/utils/brain';
import { getToken, linkedinGet, formatPost } from '../utils';
import type { WatchedKeyword, CapturedPost, LinkedInPost } from '../types';

const KEYWORDS_KEY = 'linkedin:watched_keywords';
const CAPTURES_KEY = 'linkedin:watched_captures';

export async function watchKeywords(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const action = args.action as string;

  const raw = await ctx.memory.recall(KEYWORDS_KEY) as string | null;
  const keywords: WatchedKeyword[] = raw ? JSON.parse(raw) : [];

  if (action === 'list') {
    if (!keywords.length) return 'No keywords are being monitored.';
    return (
      `Monitored LinkedIn keywords (${keywords.length}):\n` +
      keywords
        .map(
          (k) =>
            `• "${k.keyword}" — added ${new Date(k.addedAt).toLocaleDateString()}` +
            (k.lastCheckedAt
              ? `, last checked ${new Date(k.lastCheckedAt).toLocaleString()}`
              : ''),
        )
        .join('\n')
    );
  }

  if (!args.keyword?.trim()) return 'Please provide a keyword.';
  const kw = args.keyword.trim();

  if (action === 'add') {
    if (keywords.find((k) => k.keyword.toLowerCase() === kw.toLowerCase())) {
      return `"${kw}" is already being monitored.`;
    }
    keywords.push({ keyword: kw, addedAt: new Date().toISOString() });
    await ctx.memory.remember(KEYWORDS_KEY, JSON.stringify(keywords), 'context');
    return `Now monitoring "${kw}" on LinkedIn. Daily digest at 8:00.`;
  }

  if (action === 'remove') {
    const idx = keywords.findIndex(
      (k) => k.keyword.toLowerCase() === kw.toLowerCase(),
    );
    if (idx === -1) return `"${kw}" is not in the monitoring list.`;
    keywords.splice(idx, 1);
    await ctx.memory.remember(KEYWORDS_KEY, JSON.stringify(keywords), 'context');
    return `Stopped monitoring "${kw}" on LinkedIn.`;
  }

  return 'Invalid action. Use "add", "remove", or "list".';
}

export async function getWatchedFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const raw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedPost[] = raw ? JSON.parse(raw) : [];

  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    captures = captures.filter((c) => c.keyword.toLowerCase().includes(kw));
  }

  const limit = args.limit ?? 20;
  captures = captures.slice(-limit).reverse();

  if (!captures.length) return 'No posts captured yet. Next digest at 8:00.';

  const grouped = new Map<string, CapturedPost[]>();
  for (const c of captures) {
    const arr = grouped.get(c.keyword) ?? [];
    arr.push(c);
    grouped.set(c.keyword, arr);
  }

  const lines: string[] = [];
  for (const [kw, items] of grouped) {
    lines.push(`**"${kw}"** (${items.length} post(s)):`);
    for (const item of items) {
      lines.push(formatPost(item.post));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function runDigest(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getToken(ctx);

  const raw = await ctx.memory.recall(KEYWORDS_KEY) as string | null;
  const keywords: WatchedKeyword[] = raw ? JSON.parse(raw) : [];

  // Always store a general feed snapshot
  const feedData = await linkedinGet('/v2/ugcPosts', token, {
    q: 'authors',
    authors: 'List(~)',
    count: '20',
    sortBy: 'LAST_MODIFIED',
  });

  const capturesRaw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: CapturedPost[] = capturesRaw ? JSON.parse(capturesRaw) : [];
  const existingUrns = new Set(captures.map((c) => c.post.urn));
  let newCount = 0;

  // Store feed posts for each watched keyword where text matches
  const elements: any[] = feedData?.elements ?? [];

  for (const e of elements) {
    const text: string =
      e.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary
        ?.text ?? '';
    const post: LinkedInPost = {
      urn: e.id ?? '',
      authorName: e.author ?? 'Unknown',
      authorUrn: e.author ?? '',
      text,
      likeCount: e.socialDetail?.totalSocialActivityCounts?.numLikes ?? 0,
      commentCount: e.socialDetail?.totalSocialActivityCounts?.numComments ?? 0,
      createdAt: e.created?.time ?? Date.now(),
    };

    if (existingUrns.has(post.urn)) continue;

    for (const kw of keywords) {
      if (text.toLowerCase().includes(kw.keyword.toLowerCase())) {
        captures.push({
          keyword: kw.keyword,
          post,
          capturedAt: new Date().toISOString(),
        });
        newCount++;
      }
      kw.lastCheckedAt = new Date().toISOString();
    }
    existingUrns.add(post.urn);
  }

  if (captures.length > 500) captures = captures.slice(-500);

  await ctx.memory.remember(KEYWORDS_KEY, JSON.stringify(keywords), 'context');
  await ctx.memory.remember(CAPTURES_KEY, JSON.stringify(captures), 'context');

  return `LinkedIn digest complete. ${newCount} new matching post(s) captured.`;
}
