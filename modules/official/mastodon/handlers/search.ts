import type { ModuleContext } from '../../../../back/utils/brain';
import { getInstanceUrl, getToken, mastoGet, formatStatus } from '../utils';
import type { MastodonStatus } from '../types';

export async function searchMastodon(
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const [instanceUrl, token] = await Promise.all([
    getInstanceUrl(ctx),
    getToken(ctx),
  ]);

  if (!args.query?.trim()) return 'Please provide a search query.';

  const type = args.type ?? 'statuses';
  const limit = Math.min(args.limit ?? 20, 40);

  const data = await mastoGet<Record<string, any>>(
    instanceUrl,
    '/api/v2/search',
    token,
    {
      q: args.query.trim(),
      type,
      limit: limit.toString(),
      resolve: 'true',
    },
  );

  if (type === 'statuses') {
    const statuses: MastodonStatus[] = data.statuses ?? [];
    if (!statuses.length) return `No toots found for "${args.query}".`;
    return statuses.map(formatStatus).join('\n\n---\n\n');
  }

  if (type === 'accounts') {
    const accounts: any[] = data.accounts ?? [];
    if (!accounts.length) return `No accounts found for "${args.query}".`;
    return accounts
      .map(
        (a) =>
          `@${a.acct} — ${a.display_name}\n` +
          `  Followers: ${a.followers_count}  Following: ${a.following_count}\n` +
          `  ${a.url}`,
      )
      .join('\n\n');
  }

  if (type === 'hashtags') {
    const hashtags: any[] = data.hashtags ?? [];
    if (!hashtags.length) return `No hashtags found for "${args.query}".`;
    return hashtags.map((h) => `#${h.name} — ${h.url}`).join('\n');
  }

  return `Unknown search type: ${type}`;
}
