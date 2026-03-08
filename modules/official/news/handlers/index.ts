import type { ModuleContext } from '../../../../back/utils/brain';
import { handleHeadlines } from './headlines';
import { handleSearch } from './search';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'news_headlines':
      return handleHeadlines(args, ctx);

    case 'news_search':
      return handleSearch(args, ctx);

    default:
      return `Unknown tool: ${toolName}`;
  }
}
