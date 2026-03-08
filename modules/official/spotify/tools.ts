import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'spotify_now_playing',
        description:
          "Get the currently playing track on the user's Spotify. Shows song name, artist, album, progress, and device info.",
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
        name: 'spotify_recently_played',
        description:
          "Get the user's recently played tracks on Spotify. Returns up to 50 tracks with timestamps.",
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of tracks to return (default: 20, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_top_items',
        description:
          "Get the user's top tracks or artists on Spotify, based on listening habits. Useful to understand music preferences.",
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['tracks', 'artists'],
              description: 'Type of items to retrieve: "tracks" or "artists".',
            },
            timeRange: {
              type: 'string',
              enum: ['short_term', 'medium_term', 'long_term'],
              description:
                'Time range: "short_term" (last ~4 weeks), "medium_term" (last ~6 months), "long_term" (all time). Default: medium_term.',
            },
            limit: {
              type: 'number',
              description: 'Number of items to return (default: 20, max: 50).',
            },
          },
          required: ['type'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_search',
        description:
          'Search Spotify for tracks, artists, albums, or playlists by keyword.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query (e.g. "Bohemian Rhapsody", "Kendrick Lamar", "lofi beats").',
            },
            type: {
              type: 'string',
              enum: ['track', 'artist', 'album', 'playlist'],
              description: 'Type of result to search for (default: "track").',
            },
            limit: {
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
        name: 'spotify_recommendations',
        description:
          "Get personalized music recommendations from Spotify based on seed tracks, artists, or genres. Use the user's top tracks/artists as seeds for best results.",
        parameters: {
          type: 'object',
          properties: {
            seedTracks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Up to 5 Spotify track IDs to use as seeds.',
            },
            seedArtists: {
              type: 'array',
              items: { type: 'string' },
              description: 'Up to 5 Spotify artist IDs to use as seeds.',
            },
            seedGenres: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Up to 5 genre names to use as seeds (e.g. "pop", "rock", "electronic", "hip-hop", "jazz").',
            },
            limit: {
              type: 'number',
              description:
                'Number of recommendations to return (default: 20, max: 100).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_playlists',
        description: "List the user's Spotify playlists.",
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description:
                'Number of playlists to return (default: 20, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_playlist_tracks',
        description: 'Get the tracks in a specific Spotify playlist.',
        parameters: {
          type: 'object',
          properties: {
            playlistId: {
              type: 'string',
              description: 'The Spotify playlist ID.',
            },
            limit: {
              type: 'number',
              description:
                'Number of tracks to return (default: 50, max: 100).',
            },
          },
          required: ['playlistId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_create_playlist',
        description:
          'Create a new Spotify playlist for the user. Optionally add tracks to it right away.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the new playlist.',
            },
            description: {
              type: 'string',
              description: 'Description of the playlist.',
            },
            public: {
              type: 'boolean',
              description: 'Whether the playlist is public (default: false).',
            },
            trackUris: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional list of Spotify track URIs (e.g. "spotify:track:xxx") to add immediately.',
            },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_add_to_playlist',
        description: 'Add tracks to an existing Spotify playlist.',
        parameters: {
          type: 'object',
          properties: {
            playlistId: {
              type: 'string',
              description: 'The Spotify playlist ID.',
            },
            trackUris: {
              type: 'array',
              items: { type: 'string' },
              description:
                'List of Spotify track URIs to add (e.g. "spotify:track:xxx").',
            },
          },
          required: ['playlistId', 'trackUris'],
        },
      },
    },
  ];
}
