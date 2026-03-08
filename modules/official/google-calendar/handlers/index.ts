import type { ModuleContext } from '../../../../back/utils/brain';
import { getAccessToken } from '../utils';
import { handleListEvents } from './list';
import { handleCreateEvent } from './create';
import { handleUpdateEvent } from './update';
import { handleDeleteEvent } from './delete';
import { handleCheckAvailability } from './availability';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  const token = await getAccessToken(ctx);
  const calendarId = encodeURIComponent(args.calendarId ?? 'primary');

  switch (toolName) {
    case 'calendar_list_events':
      return handleListEvents(token, calendarId, args);

    case 'calendar_create_event':
      return handleCreateEvent(token, calendarId, args);

    case 'calendar_update_event':
      return handleUpdateEvent(token, calendarId, args);

    case 'calendar_delete_event':
      return handleDeleteEvent(token, calendarId, args);

    case 'calendar_check_availability':
      return handleCheckAvailability(token, args);

    default:
      return 'Unknown tool';
  }
}
