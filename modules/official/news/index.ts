/**
 * News module — uses Google News RSS (free, no API key required).
 *
 * Tools:
 *   - news_headlines: top headlines for a country/language
 *   - news_search: search news by topic/keyword
 *
 * Automatically adapts to the user's configured language via Brain config.
 */

import type { ModuleContext } from '../../../back/utils/brain';
export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  try {
    return await routeHandler(toolName, args, ctx);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
