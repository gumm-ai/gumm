import { calendarFetch, formatEventForDisplay } from '../utils';

export async function handleUpdateEvent(
  token: string,
  calendarId: string,
  args: Record<string, any>,
): Promise<string> {
  const eventId = encodeURIComponent(args.eventId);
  const patch: Record<string, any> = {};

  if (args.summary) patch.summary = args.summary;
  if (args.description) patch.description = args.description;
  if (args.location) patch.location = args.location;

  if (args.start) {
    const isAllDay = !args.start.includes('T');
    patch.start = isAllDay ? { date: args.start } : { dateTime: args.start };
  }

  if (args.end) {
    const isAllDay = !args.end.includes('T');
    patch.end = isAllDay ? { date: args.end } : { dateTime: args.end };
  }

  const updated = await calendarFetch(
    token,
    `/calendars/${calendarId}/events/${eventId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  );

  return JSON.stringify(
    {
      message: 'Event updated successfully.',
      event: formatEventForDisplay(updated),
    },
    null,
    2,
  );
}
