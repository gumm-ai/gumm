import type { ModuleContext } from '../../../../back/utils/brain';
import { getToken, getPersonUrn, linkedinGet, formatPost } from '../utils';
import type { LinkedInPost, LinkedInProfile } from '../types';

export async function getFeed(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getToken(ctx);
  const count = Math.min(args.count ?? 20, 50);

  // LinkedIn Feed API via /v2/ugcPosts scoped to the member's feed
  const data = await linkedinGet('/v2/ugcPosts', token, {
    q: 'authors',
    authors: 'List(~)',
    count: count.toString(),
    sortBy: 'LAST_MODIFIED',
  });

  const elements: any[] = data?.elements ?? [];
  if (!elements.length) return 'No posts found in your LinkedIn feed.';

  const posts: LinkedInPost[] = elements.map((e: any) => ({
    urn: e.id ?? '',
    authorName: e.author ?? 'Unknown',
    authorUrn: e.author ?? '',
    text:
      e.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary
        ?.text ?? '',
    likeCount: e.socialDetail?.totalSocialActivityCounts?.numLikes ?? 0,
    commentCount: e.socialDetail?.totalSocialActivityCounts?.numComments ?? 0,
    createdAt: e.created?.time ?? 0,
  }));

  return posts.map(formatPost).join('\n\n---\n\n');
}

export async function getProfile(
  _args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getToken(ctx);
  const profile = await linkedinGet<LinkedInProfile>('/v2/userinfo', token);

  return (
    `**${profile.name}**\n` +
    `Email: ${profile.email ?? 'N/A'}\n` +
    `ID: ${profile.sub}`
  );
}
