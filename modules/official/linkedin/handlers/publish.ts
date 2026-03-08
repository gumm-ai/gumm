import type { ModuleContext } from '../../../../back/utils/brain';
import { getToken, getPersonUrn, linkedinPost } from '../utils';

export async function publishPost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.text?.trim()) return 'Post text is required.';

  const token = await getToken(ctx);
  const personUrn = await getPersonUrn(ctx);
  const visibility = args.visibility ?? 'PUBLIC';

  const body = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: args.text.trim() },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': visibility,
    },
  };

  const resp = await linkedinPost<{ id?: string }>('/v2/ugcPosts', token, body);
  const postId = resp?.id;
  const url = postId
    ? `https://www.linkedin.com/feed/update/${postId}/`
    : 'https://www.linkedin.com/feed/';

  return `Post published on LinkedIn! 🎉\n🔗 ${url}`;
}

export async function commentOnPost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.shareUrn) return 'shareUrn is required.';
  if (!args.text?.trim()) return 'Comment text is required.';

  const token = await getToken(ctx);
  const personUrn = await getPersonUrn(ctx);

  const encodedUrn = encodeURIComponent(args.shareUrn);
  await linkedinPost(`/v2/socialActions/${encodedUrn}/comments`, token, {
    actor: personUrn,
    message: { text: args.text.trim() },
  });

  return `Comment posted on LinkedIn! 💬`;
}

export async function reactToPost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.shareUrn) return 'shareUrn is required.';

  const token = await getToken(ctx);
  const personUrn = await getPersonUrn(ctx);
  const reactionType = args.reactionType ?? 'LIKE';

  const encodedUrn = encodeURIComponent(args.shareUrn);
  await linkedinPost(`/v2/reactions/${encodedUrn}`, token, {
    actor: personUrn,
    reactionType,
  });

  const emoji: Record<string, string> = {
    LIKE: '👍',
    PRAISE: '👏',
    APPRECIATION: '🤝',
    EMPATHY: '❤️',
    INTEREST: '🤔',
    ENTERTAINMENT: '😄',
  };

  return `Reacted with ${emoji[reactionType] ?? reactionType} on the post.`;
}
