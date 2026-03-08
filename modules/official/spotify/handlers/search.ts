import type { ModuleContext } from '../../../../back/utils/brain';
import {
  spotifyFetch,
  formatTrack,
  formatArtist,
  formatAlbum,
  formatPlaylist,
} from '../utils';

/**
 * Search Spotify for tracks, artists, albums, or playlists
 */
export async function handleSearch(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const query = encodeURIComponent(args.query);
  const type = args.type || 'track';
  const limit = Math.min(args.limit || 10, 50);

  const data = await spotifyFetch(
    ctx,
    `/search?q=${query}&type=${type}&limit=${limit}`,
  );

  const formatters: Record<string, (item: any) => Record<string, any>> = {
    track: formatTrack,
    artist: formatArtist,
    album: formatAlbum,
    playlist: formatPlaylist,
  };

  const resultKey = `${type}s`;
  const items = (data[resultKey]?.items || []).map(
    formatters[type] || ((x: any) => x),
  );

  return JSON.stringify({
    type,
    query: args.query,
    count: items.length,
    items,
  });
}
