/**
 * Google Calendar module — manage events via the Google Calendar API.
 *
 * Tools:
 *   - calendar_list_events: list upcoming events
 *   - calendar_create_event: create a new event
 *   - calendar_update_event: update an existing event
 *   - calendar_delete_event: delete an event
 *   - calendar_check_availability: check free/busy status
 *
 * Shares the same Google OAuth as Gmail / Health / YouTube Music.
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
