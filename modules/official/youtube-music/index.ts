import type { ModuleContext } from '../../../back/utils/brain';
import { tools } from './tools';
import { routeHandler } from './handlers';

export { tools };

/**
 * Main handler for YouTube Music module
 */
export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return JSON.stringify({
      error:
        'Module context required. YouTube Music module needs Brain access for Google OAuth.',
    });
  }

  return routeHandler(toolName, args, ctx);
}
