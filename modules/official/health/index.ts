import type { ModuleContext } from '../../../back/utils/brain';
import { tools } from './tools';
import { getAccessToken } from './utils';
import { routeHandler } from './handlers';

export { tools };

/**
 * Main handler for Health module
 */
export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) return 'Module context is required for Google Fit access.';

  const token = await getAccessToken(ctx);
  return routeHandler(toolName, args, token);
}
