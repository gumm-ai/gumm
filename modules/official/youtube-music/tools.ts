import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'ytmusic_search',
        description:
          'Search YouTube Music for songs, music videos, and artists. Returns video results filtered to the music category.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query (e.g. "lofi hip hop", "Daft Punk Around the World").',
            },
            maxResults: {
              type: 'number',
              description:
                'Number of results to return (default: 10, max: 50).',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_trending',
        description:
          "Get trending music videos on YouTube Music. Shows what's popular right now.",
        parameters: {
          type: 'object',
          properties: {
            regionCode: {
              type: 'string',
              description:
                'ISO 3166-1 alpha-2 country code (e.g. "US", "FR", "JP"). Default: based on user language.',
            },
            maxResults: {
              type: 'number',
              description:
                'Number of results to return (default: 20, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_playlists',
        description:
          "List the user's own YouTube Music playlists (including Liked Music).",
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description:
                'Number of playlists to return (default: 25, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_playlist_items',
        description:
          'Get the videos/songs in a specific YouTube Music playlist.',
        parameters: {
          type: 'object',
          properties: {
            playlistId: {
              type: 'string',
              description:
                'The playlist ID. Use "LM" for the Liked Music playlist.',
            },
            maxResults: {
              type: 'number',
              description: 'Number of items to return (default: 50, max: 50).',
            },
          },
          required: ['playlistId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_liked_music',
        description:
          'Get the user\'s liked music videos on YouTube Music. Shortcut for the "Liked Music" playlist.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description:
                'Number of liked songs to return (default: 50, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_create_playlist',
        description: 'Create a new playlist on YouTube Music.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new playlist.',
            },
            description: {
              type: 'string',
              description: 'Description of the playlist.',
            },
            privacyStatus: {
              type: 'string',
              enum: ['public', 'unlisted', 'private'],
              description: 'Privacy status (default: "private").',
            },
            videoIds: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional list of YouTube video IDs to add immediately.',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_add_to_playlist',
        description: 'Add videos/songs to an existing YouTube Music playlist.',
        parameters: {
          type: 'object',
          properties: {
            playlistId: {
              type: 'string',
              description: 'The YouTube playlist ID.',
            },
            videoIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of YouTube video IDs to add.',
            },
          },
          required: ['playlistId', 'videoIds'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_video_details',
        description:
          'Get detailed information about a specific music video, including duration, view count, and like count.',
        parameters: {
          type: 'object',
          properties: {
            videoId: {
              type: 'string',
              description: 'The YouTube video ID.',
            },
          },
          required: ['videoId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'ytmusic_related',
        description:
          "Find music related to a specific video. Uses the video's metadata to search for similar content. Great for music discovery.",
        parameters: {
          type: 'object',
          properties: {
            videoId: {
              type: 'string',
              description: 'The YouTube video ID to find related music for.',
            },
            maxResults: {
              type: 'number',
              description:
                'Number of results to return (default: 15, max: 50).',
            },
          },
          required: ['videoId'],
        },
      },
    },
  ];
}
