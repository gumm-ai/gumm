import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'linkedin_get_feed',
        description: 'Get the latest posts from your LinkedIn home feed.',
        parameters: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: 'Number of posts to return (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_get_profile',
        description: 'Get your LinkedIn profile information.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_post',
        description: 'Publish a post on LinkedIn.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'Post content (plain text or with basic formatting).',
            },
            visibility: {
              type: 'string',
              enum: ['PUBLIC', 'CONNECTIONS'],
              description:
                'Who can see the post: "PUBLIC" (anyone) or "CONNECTIONS" (network only). Default: "PUBLIC".',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_comment',
        description: 'Add a comment to a LinkedIn post.',
        parameters: {
          type: 'object',
          properties: {
            shareUrn: {
              type: 'string',
              description:
                'URN of the LinkedIn post (e.g. "urn:li:share:1234567890").',
            },
            text: {
              type: 'string',
              description: 'Comment text.',
            },
          },
          required: ['shareUrn', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_react',
        description: 'React to a LinkedIn post (like, celebrate, etc.).',
        parameters: {
          type: 'object',
          properties: {
            shareUrn: {
              type: 'string',
              description: 'URN of the LinkedIn post.',
            },
            reactionType: {
              type: 'string',
              enum: [
                'LIKE',
                'PRAISE',
                'APPRECIATION',
                'EMPATHY',
                'INTEREST',
                'ENTERTAINMENT',
              ],
              description: 'Type of reaction. Default: "LIKE".',
            },
          },
          required: ['shareUrn'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_watch_keywords',
        description:
          'Add or remove keywords for automatic LinkedIn monitoring. A morning digest is generated daily at 8:00.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'remove', 'list'],
              description: '"add", "remove", or "list" current keywords.',
            },
            keyword: {
              type: 'string',
              description:
                'Keyword or phrase to monitor. Required for add/remove.',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_get_watched_feed',
        description: 'Get posts captured by the automatic keyword monitoring.',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description:
                'Filter by keyword. If omitted, returns all captures.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of posts (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'linkedin_run_digest',
        description:
          'Internal: scheduled handler that fetches and stores the LinkedIn morning digest.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  ];
}
