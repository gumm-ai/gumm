import type { ModuleContext } from '../../../../back/utils/brain';
import {
  getToken,
  getUserId,
  igGet,
  formatMedia,
  MEDIA_FIELDS,
} from '../utils';
import type {
  InstagramMedia,
  InstagramInsights,
  InstagramComment,
} from '../types';

export async function getMedia(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [token, userId] = await Promise.all([getToken(ctx), getUserId(ctx)]);
  const limit = Math.min(args.limit ?? 12, 50);

  const data = await igGet<{ data: any[] }>(`/${userId}/media`, token, {
    fields: MEDIA_FIELDS,
    limit: limit.toString(),
  });

  const items: InstagramMedia[] = (data.data ?? []).map((m: any) => ({
    id: m.id,
    mediaType: m.media_type,
    mediaUrl: m.media_url,
    thumbnailUrl: m.thumbnail_url,
    caption: m.caption,
    permalink: m.permalink,
    timestamp: m.timestamp,
    likeCount: m.like_count ?? 0,
    commentsCount: m.comments_count ?? 0,
  }));

  if (!items.length) return 'No Instagram posts found.';
  return items.map(formatMedia).join('\n\n---\n\n');
}

export async function getInsights(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.mediaId) return 'mediaId is required.';

  const token = await getToken(ctx);

  const data = await igGet<{ data: any[] }>(
    `/${args.mediaId}/insights`,
    token,
    { metric: 'reach,impressions,engagement,saved' },
  );

  const metrics: InsightMap = {};
  for (const m of data.data ?? []) {
    metrics[m.name as string] = m.values?.[0]?.value ?? m.value ?? 0;
  }

  return (
    `📊 Insights for media ${args.mediaId}:\n` +
    `  Reach: ${metrics['reach'] ?? 'N/A'}\n` +
    `  Impressions: ${metrics['impressions'] ?? 'N/A'}\n` +
    `  Engagement: ${metrics['engagement'] ?? 'N/A'}\n` +
    `  Saved: ${metrics['saved'] ?? 'N/A'}`
  );
}

interface InsightMap {
  [key: string]: number;
}

export async function getComments(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.mediaId) return 'mediaId is required.';

  const token = await getToken(ctx);
  const limit = Math.min(args.limit ?? 20, 50);

  const data = await igGet<{ data: any[] }>(
    `/${args.mediaId}/comments`,
    token,
    {
      fields: 'id,text,username,timestamp,like_count',
      limit: limit.toString(),
    },
  );

  const comments: InstagramComment[] = (data.data ?? []).map((c: any) => ({
    id: c.id,
    text: c.text,
    username: c.username,
    timestamp: c.timestamp,
    likeCount: c.like_count ?? 0,
  }));

  if (!comments.length) return 'No comments found on this post.';

  return comments
    .map(
      (c) =>
        `@${c.username} — ${new Date(c.timestamp).toLocaleString()} ❤️ ${c.likeCount}\n${c.text}`,
    )
    .join('\n\n---\n\n');
}
