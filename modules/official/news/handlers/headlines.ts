import type { ModuleContext } from '../../../../back/utils/brain';
import { GOOGLE_NEWS_RSS, TOPIC_IDS } from '../constants';
import {
  resolveLocale,
  fetchRss,
  parseRssItems,
  formatRelativeDate,
} from '../utils';
import { handleSearch } from './search';

export async function handleHeadlines(
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  const { hl, gl } = await resolveLocale(args, ctx);
  const count = Math.min(20, Math.max(1, Number(args.count) || 10));
  const topic = args.topic as string | undefined;

  let url: string;
  const ceid = `${gl}:${hl}`;

  if (topic) {
    const topicKey = topic.toLowerCase();
    const topicId = TOPIC_IDS[topicKey];
    if (topicId) {
      // Known category
      url = `${GOOGLE_NEWS_RSS}/headlines/section/topic/${topicId}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
    } else {
      // Treat as search query
      return handleSearch({ ...args, query: topic }, ctx);
    }
  } else {
    url = `${GOOGLE_NEWS_RSS}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
  }

  const xml = await fetchRss(url);
  const articles = parseRssItems(xml, count);

  if (articles.length === 0) {
    return JSON.stringify({ message: `No headlines found for ${gl} (${hl}).` });
  }

  return JSON.stringify(
    {
      country: gl,
      language: hl,
      topic: topic ?? 'top stories',
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
