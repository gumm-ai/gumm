import type { ModuleContext } from '../../../back/utils/brain';
import { tools } from './tools';
import { routeHandler } from './handlers';

export { tools };

/**
 * Main handler for Gmail module
 */
export async function handler(
  toolName: string,
  args: Record<string, any>,
  ctx?: ModuleContext,
): Promise<string> {
  if (!ctx) {
    return 'Error: Gmail module requires context (brain not ready).';
  }

  try {
    return await routeHandler(toolName, args, ctx);
  } catch (err: any) {
    ctx.log.error('[gmail]', err.message);
    return `Gmail error: ${err.message}`;
  }
}
