/**
 * OpenRouter Credits — monitoring module with daily snapshots.
 *
 * Tools:
 *   - openrouter_credits: Check balance & spending
 *   - openrouter_credits_history: Compare consumption over time using stored snapshots
 *
 * Scheduled handlers:
 *   - snapshot_credits: Daily midnight snapshot of remaining credits
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
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
