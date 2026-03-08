import { handleSearch } from './search';
import { handleFetch } from './fetch';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  switch (toolName) {
    case 'web_search': {
      const query = args.query as string;
      if (!query?.trim()) return 'Error: query is required.';
      return handleSearch(query.trim(), args.max_results);
    }

    case 'web_fetch': {
      const url = args.url as string;
      if (!url?.trim()) return 'Error: url is required.';
      return handleFetch(url.trim());
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
