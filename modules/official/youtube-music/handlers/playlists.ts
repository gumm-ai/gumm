import type { ModuleContext } from '../../../../back/utils/brain';
import {
  ytFetch,
  formatVideo,
  formatPlaylist,
  formatPlaylistItem,
  formatDuration,
} from '../utils';

/**
 * List the user's own YouTube Music playlists
 */
export async function handlePlaylists(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 25, 50);

  const data = await ytFetch(
    ctx,
    `/playlists?part=snippet,contentDetails&mine=true&maxResults=${maxResults}`,
  );

  const playlists = (data.items || []).map(formatPlaylist);
  return JSON.stringify({ count: playlists.length, playlists });
}

/**
 * Get the videos/songs in a specific playlist
 */
export async function handlePlaylistItems(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 50, 50);
  const playlistId = encodeURIComponent(args.playlistId);

  const data = await ytFetch(
    ctx,
    `/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}`,
  );

  const items = (data.items || []).map(formatPlaylistItem);
  return JSON.stringify({
    playlistId: args.playlistId,
    count: items.length,
    items,
  });
}

/**
 * Get the user's liked music videos
 */
export async function handleLikedMusic(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 50, 50);

  const data = await ytFetch(
    ctx,
    `/videos?part=snippet,contentDetails,statistics&myRating=like&maxResults=${maxResults}`,
  );

  const items = (data.items || []).map((item: any) => ({
    ...formatVideo(item),
    duration: item.contentDetails?.duration
      ? formatDuration(item.contentDetails.duration)
      : undefined,
    viewCount: item.statistics?.viewCount,
  }));

  return JSON.stringify({ count: items.length, likedMusic: items });
}

/**
 * Create a new playlist on YouTube Music
 */
export async function handleCreatePlaylist(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const body = {
    snippet: {
      title: args.title,
      description: args.description || '',
    },
    status: {
      privacyStatus: args.privacyStatus || 'private',
    },
  };

  const playlist = await ytFetch(ctx, '/playlists?part=snippet,status', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  // Add videos if provided
  const added: string[] = [];
  if (args.videoIds?.length) {
    for (const videoId of args.videoIds) {
      await ytFetch(ctx, '/playlistItems?part=snippet', {
        method: 'POST',
        body: JSON.stringify({
          snippet: {
            playlistId: playlist.id,
            resourceId: { kind: 'youtube#video', videoId },
          },
        }),
      });
      added.push(videoId);
    }
  }

  if (ctx) {
    await ctx.events.emit('ytmusic.playlist.created', {
      playlistId: playlist.id,
      title: args.title,
      videosAdded: added.length,
    });
  }

  return JSON.stringify({
    created: true,
    playlist: formatPlaylist(playlist),
    videosAdded: added.length,
  });
}

/**
 * Add videos/songs to an existing playlist
 */
export async function handleAddToPlaylist(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const added: string[] = [];
  const errors: string[] = [];

  for (const videoId of args.videoIds) {
    try {
      await ytFetch(ctx, '/playlistItems?part=snippet', {
        method: 'POST',
        body: JSON.stringify({
          snippet: {
            playlistId: args.playlistId,
            resourceId: { kind: 'youtube#video', videoId },
          },
        }),
      });
      added.push(videoId);
    } catch (e: any) {
      errors.push(`${videoId}: ${e.message}`);
    }
  }

  if (ctx) {
    await ctx.events.emit('ytmusic.playlist.tracks_added', {
      playlistId: args.playlistId,
      videosAdded: added.length,
    });
  }

  return JSON.stringify({
    playlistId: args.playlistId,
    videosAdded: added.length,
    ...(errors.length ? { errors } : {}),
  });
}
