import type { ModuleContext } from '../../../../back/utils/brain';
import { TIME_RANGE_LABELS } from '../constants';
import { spotifyFetch, formatTrack, formatArtist } from '../utils';

/**
 * Get the user's top tracks or artists
 */
export async function handleTopItems(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const type = args.type || 'tracks';
  const timeRange = args.timeRange || 'medium_term';
  const limit = Math.min(args.limit || 20, 50);

  const data = await spotifyFetch(
    ctx,
    `/me/top/${type}?time_range=${timeRange}&limit=${limit}`,
  );

  const items =
    type === 'tracks'
      ? data.items.map(formatTrack)
      : data.items.map(formatArtist);

  return JSON.stringify({
    type,
    timeRange: TIME_RANGE_LABELS[timeRange] || timeRange,
    count: items.length,
    items,
  });
}

/**
 * Get personalized music recommendations
 */
export async function handleRecommendations(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const limit = Math.min(args.limit || 20, 100);
  const params = new URLSearchParams({ limit: String(limit) });

  if (args.seedTracks?.length)
    params.set('seed_tracks', args.seedTracks.join(','));
  if (args.seedArtists?.length)
    params.set('seed_artists', args.seedArtists.join(','));
  if (args.seedGenres?.length)
    params.set('seed_genres', args.seedGenres.join(','));

  // If no seeds provided, fetch user's top tracks to use as seeds
  const hasSeeds =
    args.seedTracks?.length ||
    args.seedArtists?.length ||
    args.seedGenres?.length;

  if (!hasSeeds) {
    const topData = await spotifyFetch(
      ctx,
      '/me/top/tracks?time_range=short_term&limit=5',
    );
    if (topData.items?.length) {
      params.set('seed_tracks', topData.items.map((t: any) => t.id).join(','));
    } else {
      return JSON.stringify({
        error:
          'No seeds provided and no listening history found. Please provide seedTracks, seedArtists, or seedGenres.',
      });
    }
  }

  const data = await spotifyFetch(ctx, `/recommendations?${params.toString()}`);
  const tracks = (data.tracks || []).map(formatTrack);

  return JSON.stringify({
    count: tracks.length,
    seeds: {
      tracks: args.seedTracks || [],
      artists: args.seedArtists || [],
      genres: args.seedGenres || [],
      autoSeeded: !hasSeeds,
    },
    tracks,
  });
}
