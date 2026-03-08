import { calendarFetch } from '../utils';

export async function handleDeleteEvent(
  token: string,
  calendarId: string,
  args: Record<string, any>,
): Promise<string> {
  const eventId = encodeURIComponent(args.eventId);

  await calendarFetch(token, `/calendars/${calendarId}/events/${eventId}`, {
    method: 'DELETE',
  });

  return JSON.stringify({ message: 'Event deleted successfully.' });
}
