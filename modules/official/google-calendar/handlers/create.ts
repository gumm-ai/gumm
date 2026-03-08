import { calendarFetch, formatEventForDisplay } from '../utils';

export async function handleCreateEvent(
  token: string,
  calendarId: string,
  args: Record<string, any>,
): Promise<string> {
  const isAllDay = args.start && !args.start.includes('T');

  const eventBody: Record<string, any> = {
    summary: args.summary,
  };

  if (isAllDay) {
    eventBody.start = { date: args.start };
    eventBody.end = { date: args.end ?? args.start };
  } else {
    eventBody.start = { dateTime: args.start };
    if (args.end) {
      eventBody.end = { dateTime: args.end };
    } else {
      const endTime = new Date(new Date(args.start).getTime() + 60 * 60 * 1000);
      eventBody.end = { dateTime: endTime.toISOString() };
    }
  }

  if (args.description) eventBody.description = args.description;
  if (args.location) eventBody.location = args.location;
  if (args.attendees) {
    eventBody.attendees = args.attendees
      .split(',')
      .map((e: string) => ({ email: e.trim() }));
  }

  const created = await calendarFetch(
    token,
    `/calendars/${calendarId}/events`,
    { method: 'POST', body: JSON.stringify(eventBody) },
  );

  return JSON.stringify(
    {
      message: 'Event created successfully.',
      event: formatEventForDisplay(created),
    },
    null,
    2,
  );
}
