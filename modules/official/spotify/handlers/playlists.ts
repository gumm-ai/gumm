import type { ModuleContext } from '../../../../back/utils/brain';
import { spotifyFetch, formatTrack, formatPlaylist } from '../utils';

/**
 * List the user's Spotify playlists
 */
export async function handlePlaylists(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const limit = Math.min(args.limit || 20, 50);
  const data = await spotifyFetch(ctx, `/me/playlists?limit=${limit}`);
  const playlists = (data.items || []).map(formatPlaylist);

  return JSON.stringify({ count: playlists.length, playlists });
}

/**
 * Get the tracks in a specific playlist
 */
export async function handlePlaylistTracks(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const limit = Math.min(args.limit || 50, 100);
  const data = await spotifyFetch(
    ctx,
    `/playlists/${encodeURIComponent(args.playlistId)}/tracks?limit=${limit}`,
  );

  const tracks = (data.items || [])
    .filter((item: any) => item.track)
    .map((item: any) => ({
      ...formatTrack(item.track),
      addedAt: item.added_at,
      addedBy: item.added_by?.id,
    }));

  return JSON.stringify({
    playlistId: args.playlistId,
    count: tracks.length,
    tracks,
  });
}

/**
 * Create a new Spotify playlist
 */
export async function handleCreatePlaylist(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  // Get current user ID
  const me = await spotifyFetch(ctx, '/me');

  const playlist = await spotifyFetch(
    ctx,
    `/users/${encodeURIComponent(me.id)}/playlists`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: args.name,
        description: args.description || '',
        public: args.public ?? false,
      }),
    },
  );

  // Add tracks if provided
  if (args.trackUris?.length) {
    await spotifyFetch(ctx, `/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: args.trackUris }),
    });
  }

  if (ctx) {
    await ctx.events.emit('spotify.playlist.created', {
      playlistId: playlist.id,
      name: args.name,
      trackCount: args.trackUris?.length || 0,
    });
  }

  return JSON.stringify({
    created: true,
    playlist: formatPlaylist(playlist),
    tracksAdded: args.trackUris?.length || 0,
  });
}

/**
 * Add tracks to an existing playlist
 */
export async function handleAddToPlaylist(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  await spotifyFetch(
    ctx,
    `/playlists/${encodeURIComponent(args.playlistId)}/tracks`,
    {
      method: 'POST',
      body: JSON.stringify({ uris: args.trackUris }),
    },
  );

  if (ctx) {
    await ctx.events.emit('spotify.playlist.tracks_added', {
      playlistId: args.playlistId,
      trackCount: args.trackUris.length,
    });
  }

  return JSON.stringify({
    added: true,
    playlistId: args.playlistId,
    tracksAdded: args.trackUris.length,
  });
}
