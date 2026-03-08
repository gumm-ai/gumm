import type { ModuleContext } from '../../../../back/utils/brain';
import { MUSIC_CATEGORY_ID, LANG_TO_REGION } from '../constants';
import { ytFetch, formatVideo, formatDuration } from '../utils';

/**
 * Get trending music videos on YouTube Music
 */
export async function handleTrending(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 20, 50);

  // Resolve region code
  let regionCode = args.regionCode;
  if (!regionCode) {
    const lang = await ctx.brain.getConfig('brain.language');
    regionCode = LANG_TO_REGION[lang as string] || 'US';
  }

  const data = await ytFetch(
    ctx,
    `/videos?part=snippet,statistics,contentDetails&chart=mostPopular&videoCategoryId=${MUSIC_CATEGORY_ID}&regionCode=${regionCode}&maxResults=${maxResults}`,
  );

  const items = (data.items || []).map((item: any) => ({
    ...formatVideo(item),
    viewCount: item.statistics?.viewCount,
    likeCount: item.statistics?.likeCount,
    duration: item.contentDetails?.duration
      ? formatDuration(item.contentDetails.duration)
      : undefined,
  }));

  return JSON.stringify({ regionCode, count: items.length, trending: items });
}
