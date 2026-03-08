import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'twitter_get_timeline',
        description:
          'Get your Twitter/X home timeline (reverse chronological feed of people you follow).',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Number of tweets to return (1–100, default: 20).',
            },
            sinceId: {
              type: 'string',
              description: 'Only return tweets newer than this tweet ID.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_search',
        description:
          'Search recent tweets (last 7 days) by keyword, hashtag or advanced query. Supports Twitter query operators: "from:user", "#hashtag", "-exclude", etc.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query. Example: "#AI lang:en -is:retweet". Maximum 512 characters.',
            },
            maxResults: {
              type: 'number',
              description: 'Number of tweets to return (10–100, default: 20).',
            },
            sinceId: {
              type: 'string',
              description: 'Only return tweets newer than this tweet ID.',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_post_tweet',
        description: 'Post a new tweet on Twitter/X.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Tweet content. Maximum 280 characters.',
            },
          },
          required: ['text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_reply',
        description: 'Reply to an existing tweet.',
        parameters: {
          type: 'object',
          properties: {
            tweetId: {
              type: 'string',
              description: 'ID of the tweet to reply to.',
            },
            text: {
              type: 'string',
              description: 'Reply content. Maximum 280 characters.',
            },
          },
          required: ['tweetId', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_like',
        description: 'Like or unlike a tweet.',
        parameters: {
          type: 'object',
          properties: {
            tweetId: {
              type: 'string',
              description: 'ID of the tweet.',
            },
            unlike: {
              type: 'boolean',
              description: 'If true, remove the like. Default: false.',
            },
          },
          required: ['tweetId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_retweet',
        description: 'Retweet a tweet.',
        parameters: {
          type: 'object',
          properties: {
            tweetId: {
              type: 'string',
              description: 'ID of the tweet to retweet.',
            },
          },
          required: ['tweetId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_get_mentions',
        description: 'Get tweets that mention your Twitter/X account.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Number of mentions to return (1–100, default: 20).',
            },
            sinceId: {
              type: 'string',
              description: 'Only return mentions newer than this tweet ID.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_watch_keywords',
        description:
          'Add or remove keywords/hashtags from the automatic Twitter monitoring list. The system checks for new tweets every 30 minutes.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'remove', 'list'],
              description:
                '"add" to start monitoring, "remove" to stop, "list" to see current keywords.',
            },
            keyword: {
              type: 'string',
              description:
                'Keyword or hashtag to monitor (e.g. "#OpenSource" or "gumm AI"). Required for add/remove.',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_get_watched_feed',
        description:
          'Get tweets captured by the automatic keyword monitoring. Returns new tweets found since the last check.',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description:
                'Filter by specific keyword. If omitted, returns all captured tweets.',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of tweets to return (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'twitter_run_keyword_watch',
        description:
          'Internal: scheduled handler that fetches new tweets for all monitored keywords.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  ];
}
