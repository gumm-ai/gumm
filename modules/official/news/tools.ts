import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'news_headlines',
        description:
          "Get the latest news headlines. Use this when the user asks about current events, breaking news, or what's happening in the world. Automatically uses the user's configured language and country. Can filter by topic category (world, business, technology, science, entertainment, sports, health).",
        parameters: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description:
                'Optional topic category: world, business, technology, science, entertainment, sports, health. If not a known category, treated as a search query.',
            },
            country: {
              type: 'string',
              description:
                'Two-letter country code (e.g. "US", "FR", "DE"). Defaults to the user\'s country based on their language.',
            },
            language: {
              type: 'string',
              description:
                'Two-letter language code (e.g. "en", "fr", "de"). Defaults to the user\'s configured language.',
            },
            count: {
              type: 'number',
              description:
                'Number of articles to return (1-20). Defaults to 10.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'news_search',
        description:
          "Search for recent news articles on a specific topic or keyword. IMPORTANT: Use this tool whenever the user mentions, asks about, or discusses current events, recent news, or geopolitical situations — even if they already know about the news. This helps verify information, find sources, and provide up-to-date context. Automatically uses the user's configured language and country.",
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The search query (e.g. "artificial intelligence", "climate change", "SpaceX", "Turkey F-16 Cyprus").',
            },
            country: {
              type: 'string',
              description:
                'Two-letter country code (e.g. "US", "FR", "DE"). Defaults to the user\'s country based on their language.',
            },
            language: {
              type: 'string',
              description:
                'Two-letter language code (e.g. "en", "fr", "de"). Defaults to the user\'s configured language.',
            },
            count: {
              type: 'number',
              description:
                'Number of articles to return (1-20). Defaults to 10.',
            },
          },
          required: ['query'],
        },
      },
    },
  ];
}
