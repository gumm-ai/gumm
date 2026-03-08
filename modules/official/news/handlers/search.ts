import type { ModuleContext } from '../../../../back/utils/brain';
import { GOOGLE_NEWS_RSS } from '../constants';
import {
  resolveLocale,
  fetchRss,
  parseRssItems,
  formatRelativeDate,
} from '../utils';

export async function handleSearch(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const query = (args.query ?? args.topic) as string;
  if (!query) return 'Error: a search query is required.';

  const { hl, gl } = await resolveLocale(args, ctx);
  const count = Math.min(20, Math.max(1, Number(args.count) || 10));
  const ceid = `${gl}:${hl}`;

  const url = `${GOOGLE_NEWS_RSS}/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const xml = await fetchRss(url);
  const articles = parseRssItems(xml, count);

  if (articles.length === 0) {
    return JSON.stringify({
      message: `No news found for "${query}" in ${gl} (${hl}).`,
    });
  }

  return JSON.stringify(
    {
      query,
      country: gl,
      language: hl,
      count: articles.length,
      articles: articles.map((a) => ({
        title: a.title,
        source: a.source,
        published: formatRelativeDate(a.published),
        url: a.url,
      })),
    },
    null,
    2,
  );
}
