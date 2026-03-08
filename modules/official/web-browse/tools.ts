import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web for any query. Returns a list of relevant pages with title, URL, and a short snippet. Use this to find current information, news, prices, facts, articles, etc. Always prefer this over saying "I don\'t have access to the internet".',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The search query. Be specific for better results (e.g. "Python async await tutorial 2024", "Bitcoin price today").',
            },
            max_results: {
              type: 'number',
              description:
                'Maximum number of results to return (1–8). Defaults to 5.',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_fetch',
        description:
          'Fetch and read the full text content of any web page. Use this after web_search to read a specific article or page in detail. Also works directly with a URL the user provides.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'The full URL to fetch (must start with http:// or https://).',
            },
          },
          required: ['url'],
        },
      },
    },
  ];
}
