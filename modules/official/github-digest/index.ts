import type { ModuleContext } from '../../../back/utils/brain';
import { tools } from './tools';
import { getToken } from './utils';
import { routeHandler } from './handlers';

export { tools };

/**
 * Main handler for GitHub Digest module
 */
export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) return 'Module context required';

  const token = await getToken(ctx);
  return routeHandler(toolName, args, token);
}
