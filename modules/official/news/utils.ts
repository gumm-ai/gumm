import type { ModuleContext } from '../../../back/utils/brain';
import type { NewsArticle } from './types';
import { GOOGLE_NEWS_RSS, LANG_TO_COUNTRY } from './constants';

export function parseRssItems(xml: string, limit: number): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null && articles.length < limit) {
    const block = match[1]!;

    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const source = extractTag(block, 'source');

    if (title && link) {
      articles.push({
        title: decodeHtmlEntities(title),
        source: source ? decodeHtmlEntities(source) : 'Unknown',
        url: link,
        published: pubDate ?? '',
      });
    }
  }

  return articles;
}

export function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`,
    's',
  );
  const m = regex.exec(xml);
  return m?.[1]?.trim() ?? null;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

export function formatRelativeDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return dateStr;
  }
}

export async function resolveLocale(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<{ hl: string; gl: string }> {
  // Explicit args take priority
  let lang = args.language as string | undefined;
  let country = args.country as string | undefined;

  // Fall back to Brain config
  if (!lang && ctx) {
    const brainLang = await ctx.brain.getConfig('brain.language');
    if (brainLang) lang = brainLang;
  }

  // Normalize
  lang = lang?.toLowerCase().slice(0, 2) ?? 'en';
  country = country?.toUpperCase().slice(0, 2) ?? LANG_TO_COUNTRY[lang] ?? 'US';

  return { hl: lang, gl: country };
}

export async function fetchRss(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Gumm/1.0 (News Module)',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });
  if (!res.ok) {
    throw new Error(`Google News returned ${res.status}: ${res.statusText}`);
  }
  return res.text();
}
