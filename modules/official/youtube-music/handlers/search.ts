import type { ModuleContext } from '../../../../back/utils/brain';
import { MUSIC_CATEGORY_ID } from '../constants';
import { ytFetch, formatVideo } from '../utils';

/**
 * Search YouTube Music for songs, music videos, and artists
 */
export async function handleSearch(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 10, 50);
  const query = encodeURIComponent(args.query);

  const data = await ytFetch(
    ctx,
    `/search?part=snippet&q=${query}&type=video&videoCategoryId=${MUSIC_CATEGORY_ID}&maxResults=${maxResults}`,
  );

  const items = (data.items || []).map(formatVideo);
  return JSON.stringify({
    query: args.query,
    count: items.length,
    results: items,
  });
}
