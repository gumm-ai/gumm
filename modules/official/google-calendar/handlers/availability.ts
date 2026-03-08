import { calendarFetch } from '../utils';

export async function handleCheckAvailability(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const now = new Date();
  const timeMin = args.timeMin ?? now.toISOString();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const timeMax = args.timeMax ?? endOfDay.toISOString();

  const freeBusyBody = {
    timeMin,
    timeMax,
    items: [{ id: args.calendarId ?? 'primary' }],
  };

  const data = await calendarFetch(token, '/freeBusy', {
    method: 'POST',
    body: JSON.stringify(freeBusyBody),
  });

  const busySlots = data.calendars?.[args.calendarId ?? 'primary']?.busy ?? [];

  if (busySlots.length === 0) {
    return JSON.stringify({
      status: 'free',
      message: `You are completely free from ${timeMin} to ${timeMax}.`,
    });
  }

  return JSON.stringify(
    {
      status: 'partially_busy',
      busySlots: busySlots.map((s: any) => ({
        start: s.start,
        end: s.end,
      })),
      timeRange: { from: timeMin, to: timeMax },
    },
    null,
    2,
  );
}
