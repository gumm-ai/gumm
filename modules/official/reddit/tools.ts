import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'reddit_get_feed',
        description:
          'Get posts from a subreddit or your personal Reddit feed. Supports hot, new, top, and rising sorts.',
        parameters: {
          type: 'object',
          properties: {
            subreddit: {
              type: 'string',
              description:
                'Subreddit name without "r/" prefix (e.g. "programming"). Use "all" for the global feed. Default: "all".',
            },
            sort: {
              type: 'string',
              enum: ['hot', 'new', 'top', 'rising'],
              description: 'Sort order. Default: "hot".',
            },
            timeFilter: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              description: 'Time filter for "top" sort. Default: "week".',
            },
            limit: {
              type: 'number',
              description: 'Number of posts (1–100, default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_search',
        description:
          'Search Reddit posts by keywords, optionally within a specific subreddit.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query (full-text search).',
            },
            subreddit: {
              type: 'string',
              description:
                'Limit search to this subreddit. If omitted, searches all of Reddit.',
            },
            sort: {
              type: 'string',
              enum: ['relevance', 'hot', 'new', 'top'],
              description: 'Sort order. Default: "relevance".',
            },
            timeFilter: {
              type: 'string',
              enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
              description: 'Time filter. Default: "all".',
            },
            limit: {
              type: 'number',
              description: 'Number of results (1–100, default: 20).',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_post',
        description: 'Submit a new post (text or link) to a subreddit.',
        parameters: {
          type: 'object',
          properties: {
            subreddit: {
              type: 'string',
              description: 'Subreddit to post to (without "r/").',
            },
            title: {
              type: 'string',
              description: 'Post title.',
            },
            text: {
              type: 'string',
              description: 'Post body (markdown). Use for self/text posts.',
            },
            url: {
              type: 'string',
              description:
                'URL for link posts. Provide either text or url, not both.',
            },
          },
          required: ['subreddit', 'title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_comment',
        description:
          'Add a comment to a Reddit post or reply to an existing comment.',
        parameters: {
          type: 'object',
          properties: {
            thingId: {
              type: 'string',
              description:
                'Reddit fullname of the post (t3_xxx) or comment (t1_xxx) to reply to.',
            },
            text: {
              type: 'string',
              description: 'Comment text (markdown supported).',
            },
          },
          required: ['thingId', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_vote',
        description: 'Vote on a Reddit post or comment.',
        parameters: {
          type: 'object',
          properties: {
            thingId: {
              type: 'string',
              description:
                'Reddit fullname of the post or comment (e.g. "t3_abc123").',
            },
            dir: {
              type: 'number',
              enum: [1, 0, -1],
              description: '1 = upvote, -1 = downvote, 0 = clear vote.',
            },
          },
          required: ['thingId', 'dir'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_get_comments',
        description: 'Get comments from a Reddit post.',
        parameters: {
          type: 'object',
          properties: {
            articleId: {
              type: 'string',
              description: 'Post ID (without "t3_" prefix).',
            },
            subreddit: {
              type: 'string',
              description: 'Subreddit of the post.',
            },
            limit: {
              type: 'number',
              description: 'Number of top-level comments (default: 10).',
            },
          },
          required: ['articleId', 'subreddit'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_watch',
        description:
          'Add or remove a subreddit/keyword watch for automatic monitoring. The system checks every hour.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add', 'remove', 'list'],
              description: '"add", "remove", or "list" current watches.',
            },
            subreddit: {
              type: 'string',
              description:
                'Subreddit to watch (without "r/"). Required for add/remove.',
            },
            keyword: {
              type: 'string',
              description: 'Optional keyword filter within the subreddit.',
            },
          },
          required: ['action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_get_watched',
        description:
          'Get posts captured by the automatic subreddit monitoring.',
        parameters: {
          type: 'object',
          properties: {
            subreddit: {
              type: 'string',
              description:
                'Filter by subreddit. If omitted, returns all captures.',
            },
            limit: {
              type: 'number',
              description: 'Maximum posts to return (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reddit_run_monitor',
        description:
          'Internal: scheduled handler that checks monitored subreddits for new posts.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  ];
}
