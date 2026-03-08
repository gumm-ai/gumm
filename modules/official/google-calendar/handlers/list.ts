import { calendarFetch, formatEventForDisplay } from '../utils';

export async function handleListEvents(
  token: string,
  calendarId: string,
  args: Record<string, any>,
): Promise<string> {
  const now = new Date();
  const timeMin = args.timeMin ?? now.toISOString();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const timeMax = args.timeMax ?? weekFromNow.toISOString();
  const maxResults = Math.min(50, Math.max(1, Number(args.maxResults) || 20));

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: maxResults.toString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const data = await calendarFetch(
    token,
    `/calendars/${calendarId}/events?${params}`,
  );

  const events = (data.items ?? []).map(formatEventForDisplay);

  if (events.length === 0) {
    return JSON.stringify({
      message: 'No events found in the specified time range.',
      timeRange: { from: timeMin, to: timeMax },
    });
  }

  return JSON.stringify({ events, count: events.length }, null, 2);
}
