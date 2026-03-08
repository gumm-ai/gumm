import type { ModuleContext } from '../../../../back/utils/brain';
import {
  getCredentials,
  twitterGet,
  parseTweets,
  TWEET_FIELDS,
  EXPANSIONS,
  USER_FIELDS,
} from '../utils';
import type { WatchedKeyword, WatchedTweet } from '../types';

const KEYWORDS_KEY = 'twitter:watched_keywords';
const CAPTURES_KEY = 'twitter:watched_captures';

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
      `Monitored keywords (${keywords.length}):\n` +
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
    return `Now monitoring "${kw}" on Twitter. Checks every 30 minutes.`;
  }

  if (action === 'remove') {
    const idx = keywords.findIndex(
      (k) => k.keyword.toLowerCase() === kw.toLowerCase(),
    );
    if (idx === -1) return `"${kw}" is not in the monitoring list.`;
    keywords.splice(idx, 1);
    await ctx.memory.remember(KEYWORDS_KEY, JSON.stringify(keywords), 'context');
    return `Stopped monitoring "${kw}".`;
  }

  return 'Invalid action. Use "add", "remove", or "list".';
}

export async function getWatchedFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const raw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: WatchedTweet[] = raw ? JSON.parse(raw) : [];

  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    captures = captures.filter((c) => c.keyword.toLowerCase().includes(kw));
  }

  const limit = args.limit ?? 20;
  captures = captures.slice(-limit).reverse();

  if (!captures.length) {
    return 'No tweets captured yet. The system checks every 30 minutes.';
  }

  const grouped = new Map<string, WatchedTweet[]>();
  for (const c of captures) {
    const arr = grouped.get(c.keyword) ?? [];
    arr.push(c);
    grouped.set(c.keyword, arr);
  }

  const lines: string[] = [];
  for (const [kw, items] of grouped) {
    lines.push(`**"${kw}"** (${items.length} tweet(s)):`);
    for (const item of items) {
      const t = item.tweet;
      const author = t.authorUsername ? `@${t.authorUsername}` : t.authorId;
      const date = t.createdAt ? new Date(t.createdAt).toLocaleString() : '';
      lines.push(`  [${date}] ${author}: ${t.text}`);
      if (t.url) lines.push(`  🔗 ${t.url}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function runKeywordWatch(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const creds = await getCredentials(ctx);

  const raw = await ctx.memory.recall(KEYWORDS_KEY) as string | null;
  const keywords: WatchedKeyword[] = raw ? JSON.parse(raw) : [];

  if (!keywords.length) return 'No keywords to monitor.';

  const capturesRaw = await ctx.memory.recall(CAPTURES_KEY) as string | null;
  let captures: WatchedTweet[] = capturesRaw ? JSON.parse(capturesRaw) : [];

  const existingIds = new Set(captures.map((c) => c.tweet.id));
  let newCount = 0;

  for (const kw of keywords) {
    try {
      const params: Record<string, string> = {
        query: `${kw.keyword} -is:retweet`,
        max_results: '20',
        'tweet.fields': TWEET_FIELDS,
        expansions: EXPANSIONS,
        'user.fields': USER_FIELDS,
      };
      if (kw.lastTweetId) params['since_id'] = kw.lastTweetId;

      const data = await twitterGet('/tweets/search/recent', creds, params);
      const tweets = parseTweets(data);

      for (const t of tweets) {
        if (!existingIds.has(t.id)) {
          captures.push({
            keyword: kw.keyword,
            tweet: t,
            capturedAt: new Date().toISOString(),
          });
          existingIds.add(t.id);
          newCount++;
        }
      }

      kw.lastCheckedAt = new Date().toISOString();
      if (tweets.length > 0) {
        kw.lastTweetId = tweets[0]!.id;
      }
    } catch (err) {
      ctx.log.error(`Twitter watch error for "${kw.keyword}": ${err}`);
    }
  }

  // Keep only the last 500 captures to avoid unbounded growth
  if (captures.length > 500) {
    captures = captures.slice(-500);
  }

  await ctx.memory.remember(KEYWORDS_KEY, JSON.stringify(keywords), 'context');
  await ctx.memory.remember(CAPTURES_KEY, JSON.stringify(captures), 'context');

  return `Keyword watch complete. ${newCount} new tweet(s) captured across ${keywords.length} keyword(s).`;
}
