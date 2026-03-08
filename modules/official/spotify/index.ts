import type { ModuleContext } from '../../../back/utils/brain';
import { tools } from './tools';
import { routeHandler } from './handlers';

export { tools };

/**
 * Main handler for Spotify module
 */
export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error:
        'Module context required. Spotify module needs Brain access for OAuth.',
    });
  }

  return routeHandler(toolName, args, ctx);
}
