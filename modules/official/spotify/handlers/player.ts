import type { ModuleContext } from '../../../../back/utils/brain';
import { spotifyFetch, formatTrack, formatDuration } from '../utils';

/**
 * Get the currently playing track on Spotify
 */
export async function handleNowPlaying(ctx: ModuleContext): Promise<string> {
  const data = await spotifyFetch(ctx, '/me/player');
  if (!data || !data.item) {
    return JSON.stringify({
      status: 'nothing_playing',
      message: 'Nothing is currently playing on Spotify.',
    });
  }

  const track = data.item;
  return JSON.stringify({
    status: data.is_playing ? 'playing' : 'paused',
    track: formatTrack(track),
    progress: formatDuration(data.progress_ms),
    totalDuration: formatDuration(track.duration_ms),
    device: data.device
      ? {
          name: data.device.name,
          type: data.device.type,
          volume: data.device.volume_percent,
        }
      : null,
    shuffleState: data.shuffle_state,
    repeatState: data.repeat_state,
  });
}

/**
 * Get the user's recently played tracks
 */
export async function handleRecentlyPlayed(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const limit = Math.min(args.limit || 20, 50);
  const data = await spotifyFetch(
    ctx,
    `/me/player/recently-played?limit=${limit}`,
  );

  const tracks = data.items.map((item: any) => ({
    ...formatTrack(item.track),
    playedAt: item.played_at,
  }));

  return JSON.stringify({ count: tracks.length, tracks });
}
