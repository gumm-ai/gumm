import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'mastodon_get_timeline',
        description:
          'Get Mastodon timeline posts. Supports home (people you follow), local (your instance), or public (federated) timelines.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['home', 'local', 'public'],
              description: 'Timeline type. Default: "home".',
            },
            limit: {
              type: 'number',
              description: 'Number of toots to return (default: 20, max: 40).',
            },
            sinceId: {
              type: 'string',
              description: 'Only return statuses newer than this ID.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_search',
        description: 'Search Mastodon for statuses, accounts, or hashtags.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query (keyword, hashtag with #, or @handle).',
            },
            type: {
              type: 'string',
              enum: ['statuses', 'accounts', 'hashtags'],
              description: 'Type of results to return. Default: "statuses".',
            },
            limit: {
              type: 'number',
              description: 'Number of results (default: 20).',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_post',
        description: 'Post a new toot on Mastodon.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'Toot content. Most instances allow up to 500 characters.',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'unlisted', 'private', 'direct'],
              description: 'Visibility. Default: "public".',
            },
            spoilerText: {
              type: 'string',
              description:
                'Content Warning text (shown before the toot is expanded).',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_reply',
        description: 'Reply to a Mastodon toot.',
        parameters: {
          type: 'object',
          properties: {
            statusId: {
              type: 'string',
              description: 'ID of the toot to reply to.',
            },
            text: {
              type: 'string',
              description: 'Reply content.',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'unlisted', 'private', 'direct'],
              description: 'Visibility. Default: "public".',
            },
          },
          required: ['statusId', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_action',
        description:
          'Boost (reblog), unboost, favourite, or unfavourite a Mastodon toot.',
        parameters: {
          type: 'object',
          properties: {
            statusId: {
              type: 'string',
              description: 'ID of the toot.',
            },
            action: {
              type: 'string',
              enum: ['boost', 'unboost', 'favourite', 'unfavourite'],
              description: 'Action to perform.',
            },
          },
          required: ['statusId', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_get_notifications',
        description:
          'Get your Mastodon notifications (mentions, boosts, follows, favourites).',
        parameters: {
          type: 'object',
          properties: {
            types: {
              type: 'string',
              description:
                'Comma-separated notification types to include: mention, reblog, favourite, follow. If omitted, returns all types.',
            },
            limit: {
              type: 'number',
              description: 'Number of notifications (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_watch_hashtags',
        description:
          'Add or remove hashtags from automatic Mastodon monitoring. The system checks every 30 minutes.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'remove', 'list'],
              description: '"add", "remove", or "list" current hashtags.',
            },
            hashtag: {
              type: 'string',
              description:
                'Hashtag to monitor (with or without #). Required for add/remove.',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_get_watched_feed',
        description: 'Get toots captured by the automatic hashtag monitoring.',
        parameters: {
          type: 'object',
          properties: {
            hashtag: {
              type: 'string',
              description:
                'Filter by hashtag. If omitted, returns all captures.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of toots to return (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mastodon_run_hashtag_watch',
        description:
          'Internal: scheduled handler that fetches new toots for monitored hashtags.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  ];
}
