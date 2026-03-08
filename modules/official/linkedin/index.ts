/**
 * LinkedIn module
 *
 * Tools:
 *   - linkedin_get_feed        : browse LinkedIn home feed
 *   - linkedin_get_profile     : get your profile info
 *   - linkedin_post            : publish a post
 *   - linkedin_comment         : comment on a post
 *   - linkedin_react           : like/celebrate/etc. a post
 *   - linkedin_watch_keywords  : manage keyword monitoring
 *   - linkedin_get_watched_feed: get captured posts from monitoring
 *   - linkedin_run_digest      : scheduled morning digest (8:00 daily)
 *
 * Requires LinkedIn OAuth 2.0 (OpenID Connect + w_member_social scope).
 */

import type { ModuleContext } from '../../../back/utils/brain';
export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) return 'Module context required';
  try {
    return await routeHandler(toolName, args, ctx);
  } catch (err) {
    return `LinkedIn error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
