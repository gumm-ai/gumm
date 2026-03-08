import type { ModuleContext } from '../../../../back/utils/brain';
import { getInstanceUrl, getToken, mastoPost, mastoDelete } from '../utils';

export async function postToot(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.text?.trim()) return 'Toot text is required.';

  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  const body: Record<string, any> = {
    status: args.text.trim(),
    visibility: args.visibility ?? 'public',
  };

  if (args.spoilerText) body['spoiler_text'] = args.spoilerText;
  if (args.replyToId) body['in_reply_to_id'] = args.replyToId;

  const status = await mastoPost<{ id: string; url: string }>(
    instanceUrl,
    '/api/v1/statuses',
    token,
    body,
  );

  return `Toot posted! 🐘\n🔗 ${status.url ?? `${instanceUrl}/@me/${status.id}`}`;
}

export async function replyToToot(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.statusId) return 'statusId is required.';
  if (!args.text?.trim()) return 'Reply text is required.';

  return postToot(
    {
      text: args.text,
      visibility: args.visibility ?? 'public',
      replyToId: args.statusId,
    },
    ctx,
  );
}

export async function performAction(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  if (!args.statusId) return 'statusId is required.';
  if (!args.action) return 'action is required.';

  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  const { statusId, action } = args;

  switch (action) {
    case 'boost':
      await mastoPost(
        instanceUrl,
        `/api/v1/statuses/${statusId}/reblog`,
        token,
        {},
      );
      return `Toot ${statusId} boosted! 🔁`;
    case 'unboost':
      await mastoPost(
        instanceUrl,
        `/api/v1/statuses/${statusId}/unreblog`,
        token,
        {},
      );
      return `Boost removed from toot ${statusId}.`;
    case 'favourite':
      await mastoPost(
        instanceUrl,
        `/api/v1/statuses/${statusId}/favourite`,
        token,
        {},
      );
      return `Toot ${statusId} favourited! ⭐`;
    case 'unfavourite':
      await mastoPost(
        instanceUrl,
        `/api/v1/statuses/${statusId}/unfavourite`,
        token,
        {},
      );
      return `Favourite removed from toot ${statusId}.`;
    default:
      return `Unknown action: ${action}. Use boost/unboost/favourite/unfavourite.`;
  }
}
