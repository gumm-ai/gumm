import type { ModuleContext } from '../../../../back/utils/brain';
import { MUSIC_CATEGORY_ID } from '../constants';
import { ytFetch, formatVideo, formatDuration } from '../utils';

/**
 * Get detailed information about a specific music video
 */
export async function handleVideoDetails(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const data = await ytFetch(
    ctx,
    `/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(args.videoId)}`,
  );

  if (!data.items?.length) {
    return JSON.stringify({ error: 'Video not found.' });
  }

  const item = data.items[0];
  return JSON.stringify({
    ...formatVideo(item),
    duration: item.contentDetails?.duration
      ? formatDuration(item.contentDetails.duration)
      : undefined,
    viewCount: item.statistics?.viewCount,
    likeCount: item.statistics?.likeCount,
    commentCount: item.statistics?.commentCount,
    tags: item.snippet?.tags?.slice(0, 10),
    categoryId: item.snippet?.categoryId,
  });
}

/**
 * Find music related to a specific video
 */
export async function handleRelated(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const maxResults = Math.min(args.maxResults || 15, 50);

  // Get the original video details to build a search query
  const videoData = await ytFetch(
    ctx,
    `/videos?part=snippet&id=${encodeURIComponent(args.videoId)}`,
  );

  if (!videoData.items?.length) {
    return JSON.stringify({ error: 'Source video not found.' });
  }

  const sourceVideo = videoData.items[0];
  const title = sourceVideo.snippet?.title || '';
  const channel = sourceVideo.snippet?.channelTitle || '';

  // Search for related music using the video title and channel
  const searchQuery = encodeURIComponent(`${title} ${channel}`);
  const data = await ytFetch(
    ctx,
    `/search?part=snippet&q=${searchQuery}&type=video&videoCategoryId=${MUSIC_CATEGORY_ID}&maxResults=${maxResults + 1}`,
  );

  // Filter out the source video
  const items = (data.items || [])
    .filter((item: any) => {
      const id = typeof item.id === 'string' ? item.id : item.id?.videoId;
      return id !== args.videoId;
    })
    .slice(0, maxResults)
    .map(formatVideo);

  return JSON.stringify({
    sourceVideo: { title, channel, videoId: args.videoId },
    count: items.length,
    related: items,
  });
}
