import type { ModuleContext } from '../../../back/utils/brain';
import { CALENDAR_API, TOKEN_URL } from './constants';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Get a valid Google access token for Calendar API
 */
export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  const refreshToken = await ctx.brain.getConfig('api.google.refreshToken');
  const clientId = await ctx.brain.getConfig('api.google.clientId');
  const clientSecret = await ctx.brain.getConfig('api.google.clientSecret');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Google API not configured. Please connect Google in the APIs page and complete OAuth.',
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Google access token: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ─── API Helpers ────────────────────────────────────────────────────────────

/**
 * Make an authenticated request to the Google Calendar API
 */
export async function calendarFetch(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<any> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${err}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Formatters ─────────────────────────────────────────────────────────────

/**
 * Format an event for display
 */
export function formatEventForDisplay(event: any): Record<string, any> {
  const start = event.start?.dateTime ?? event.start?.date ?? '';
  const end = event.end?.dateTime ?? event.end?.date ?? '';
  const isAllDay = !event.start?.dateTime;

  const result: Record<string, any> = {
    id: event.id,
    title: event.summary ?? '(No title)',
    start,
    end,
    allDay: isAllDay,
  };

  if (event.location) result.location = event.location;
  if (event.description) result.description = event.description;
  if (event.attendees?.length) {
    result.attendees = event.attendees.map(
      (a: any) =>
        `${a.displayName ?? a.email} (${a.responseStatus ?? 'unknown'})`,
    );
  }
  if (event.htmlLink) result.link = event.htmlLink;
  if (event.status === 'cancelled') result.status = 'cancelled';

  return result;
}
