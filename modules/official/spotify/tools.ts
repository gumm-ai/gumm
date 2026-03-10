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

    // ── Playback Control ──────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'spotify_play',
        description:
          'Start or resume playback on Spotify via the Spotify API. This is the ONLY way to play a specific song, album, or playlist.\n\n**CRITICAL: Do NOT use execute_on_cli or open_application to open Spotify.** This tool handles everything: it will wait for Spotify to become available if needed (up to 10 seconds). Just call this tool with a URI and it will work.\n\n**Workflow to play music:**\n1. User asks to play music → FIRST call spotify_search OR spotify_top_items OR spotify_recommendations to find a track/playlist URI\n2. Then call THIS tool (spotify_play) with the URI\n3. DONE — no need to open the app first, this tool handles it\n\n**How to pick the right URI:**\n- User asks for a specific artist/song they like → spotify_top_items or spotify_recently_played, pick a track URI\n- User asks for a genre, mood, or playlist (e.g. "ambient", "bvdub") → spotify_search with type="playlist" or type="track", pick best URI\n- User says "resume" or "play" with no specifics → call this tool with no URI (resumes current playback)\n\n**NEVER call execute_on_cli to open Spotify. NEVER call this tool without a URI unless user explicitly says "resume".**',
        parameters: {
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              description:
                'Optional Spotify URI to play (e.g. "spotify:track:xxx", "spotify:album:xxx", "spotify:playlist:xxx"). If omitted, resumes current playback.',
            },
            deviceId: {
              type: 'string',
              description:
                'Optional device ID to play on. If omitted, plays on the active device.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_pause',
        description: 'Pause Spotify playback.',
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
        name: 'spotify_next',
        description: 'Skip to the next track on Spotify.',
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
        name: 'spotify_previous',
        description: 'Go back to the previous track on Spotify.',
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
        name: 'spotify_volume',
        description: 'Set the Spotify playback volume.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'number',
              description: 'Volume level between 0 and 100.',
            },
          },
          required: ['volume'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_shuffle',
        description: 'Toggle shuffle mode on Spotify.',
        parameters: {
          type: 'object',
          properties: {
            state: {
              type: 'boolean',
              description: 'true to enable shuffle, false to disable.',
            },
          },
          required: ['state'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_repeat',
        description: 'Set repeat mode on Spotify.',
        parameters: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['off', 'track', 'context'],
              description:
                'Repeat mode: "off", "track" (repeat current), or "context" (repeat playlist/album).',
            },
          },
          required: ['state'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'spotify_devices',
        description:
          'List available Spotify playback devices. Useful to find the right device before starting playback.',
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
        name: 'spotify_queue',
        description: 'Add a track to the Spotify playback queue.',
        parameters: {
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              description:
                'Spotify track URI to add to queue (e.g. "spotify:track:xxx").',
            },
          },
          required: ['uri'],
        },
      },
    },
  ];
}
