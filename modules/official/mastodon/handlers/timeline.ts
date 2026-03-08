import type { ModuleContext } from '../../../../back/utils/brain';
import { getInstanceUrl, getToken, mastoGet, formatStatus } from '../utils';
import type { MastodonStatus, MastodonNotification } from '../types';

export async function getTimeline(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  const type = args.type ?? 'home';
  const limit = Math.min(args.limit ?? 20, 40);

  const path =
    type === 'home'
      ? '/api/v1/timelines/home'
      : type === 'local'
        ? '/api/v1/timelines/public'
        : '/api/v1/timelines/public';

  const params: Record<string, string> = { limit: limit.toString() };
  if (type === 'local') params['local'] = 'true';
  if (args.sinceId) params['since_id'] = args.sinceId;

  const statuses = await mastoGet<MastodonStatus[]>(
    instanceUrl,
    path,
    token,
    params,
  );

  if (!statuses.length) return `No toots found in the ${type} timeline.`;

  return statuses.map(formatStatus).join('\n\n---\n\n');
}

export async function getNotifications(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  const limit = Math.min(args.limit ?? 20, 40);
  const params: Record<string, string> = { limit: limit.toString() };
  if (args.types) {
    // types is comma-separated: "mention,reblog"
    const typeList = args.types.split(',').map((t: string) => t.trim());
    for (const t of typeList) {
      params['types[]'] = t;
    }
  }

  const notifications = await mastoGet<MastodonNotification[]>(
    instanceUrl,
    '/api/v1/notifications',
    token,
    params,
  );

  if (!notifications.length) return 'No notifications found.';

  return notifications
    .map((n) => {
      const date = new Date(n.createdAt).toLocaleString();
      const actor = `@${n.account.acct}`;
      const typeLabel: Record<string, string> = {
        mention: '💬 Mentioned you',
        reblog: '🔁 Boosted your toot',
        favourite: '⭐ Favourited your toot',
        follow: '👤 Followed you',
        poll: '📊 A poll you voted in ended',
      };
      const label = typeLabel[n.type] ?? n.type;
      const snippet = n.status
        ? `\n  "${formatStatus(n.status).split('\n')[0]}"`
        : '';
      return `[${date}] ${actor} — ${label}${snippet}`;
    })
    .join('\n');
}
