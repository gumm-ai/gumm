import type { ModuleContext } from '../../../../back/utils/brain';
import { getAccessToken, redditPost } from '../utils';

export async function submitPost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.subreddit) return 'subreddit is required.';
  if (!args.title) return 'title is required.';
  if (!args.text && !args.url)
    return 'Provide either text (selfpost) or url (link post).';

  const token = await getAccessToken(ctx);

  const body: Record<string, string> = {
    sr: args.subreddit,
    title: args.title,
    kind: args.url ? 'link' : 'self',
    resubmit: 'true',
    nsfw: 'false',
    spoiler: 'false',
    api_type: 'json',
  };

  if (args.url) body['url'] = args.url;
  if (args.text) body['text'] = args.text;

  const data = await redditPost('/api/submit', token, body);
  const json = data?.json;

  if (json?.errors?.length) {
    return `Reddit post error: ${json.errors.map((e: any[]) => e[1]).join(', ')}`;
  }

  const postUrl = json?.data?.url ?? `https://reddit.com/r/${args.subreddit}`;
  return `Post submitted successfully! 🎉\n🔗 ${postUrl}`;
}

export async function commentPost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.thingId) return 'thingId is required.';
  if (!args.text) return 'Comment text is required.';

  const token = await getAccessToken(ctx);

  const data = await redditPost('/api/comment', token, {
    thing_id: args.thingId,
    text: args.text,
    api_type: 'json',
  });

  const json = data?.json;
  if (json?.errors?.length) {
    return `Comment error: ${json.errors.map((e: any[]) => e[1]).join(', ')}`;
  }

  return 'Comment posted successfully! 💬';
}

export async function votePost(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.thingId) return 'thingId is required.';
  if (args.dir === undefined) return 'dir is required (1, -1, or 0).';

  const token = await getAccessToken(ctx);

  await redditPost('/api/vote', token, {
    id: args.thingId,
    dir: String(args.dir),
  });

  const label =
    args.dir === 1 ? 'Upvoted' : args.dir === -1 ? 'Downvoted' : 'Vote cleared';
  return `${label}: ${args.thingId}`;
}
