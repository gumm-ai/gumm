import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'instagram_get_media',
        description:
          'Get your latest Instagram posts (photos, videos, carousels).',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of posts to return (default: 12, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_get_insights',
        description: 'Get engagement insights for a specific Instagram post.',
        parameters: {
          type: 'object',
          properties: {
            mediaId: {
              type: 'string',
              description: 'Instagram media ID.',
            },
          },
          required: ['mediaId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_post_image',
        description:
          'Publish a photo to Instagram. The image must be accessible via a public URL.',
        parameters: {
          type: 'object',
          properties: {
            imageUrl: {
              type: 'string',
              description:
                'Public URL of the image to post (JPEG recommended).',
            },
            caption: {
              type: 'string',
              description:
                'Post caption (supports emojis and hashtags). Max 2200 characters.',
            },
          },
          required: ['imageUrl'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_post_carousel',
        description: 'Publish a carousel (multiple images) to Instagram.',
        parameters: {
          type: 'object',
          properties: {
            imageUrls: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of public image URLs (2–10 images).',
            },
            caption: {
              type: 'string',
              description: 'Caption for the carousel post.',
            },
          },
          required: ['imageUrls'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_get_comments',
        description: 'Get comments on one of your Instagram posts.',
        parameters: {
          type: 'object',
          properties: {
            mediaId: {
              type: 'string',
              description: 'Instagram media ID.',
            },
            limit: {
              type: 'number',
              description: 'Number of comments to return (default: 20).',
            },
          },
          required: ['mediaId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_reply_comment',
        description: 'Reply to a comment on one of your Instagram posts.',
        parameters: {
          type: 'object',
          properties: {
            commentId: {
              type: 'string',
              description: 'ID of the comment to reply to.',
            },
            text: {
              type: 'string',
              description: 'Reply text.',
            },
          },
          required: ['commentId', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_watch_hashtags',
        description:
          'Add or remove hashtags for automatic Instagram monitoring. Checks hourly. Note: Instagram limits to 30 unique hashtags per 7 days.',
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
        name: 'instagram_get_watched_feed',
        description: 'Get posts captured by the automatic hashtag monitoring.',
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
              description: 'Maximum number of posts to return (default: 20).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'instagram_run_hashtag_watch',
        description:
          'Internal: scheduled handler that fetches top posts for monitored hashtags.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
  ];
}
