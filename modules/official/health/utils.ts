import type { ModuleContext } from '../../../back/utils/brain';
import { FIT_API, TOKEN_URL } from './constants';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Get a valid Google access token for Fitness API
 */
export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  const refreshToken = await ctx.brain.getConfig('api.google.refreshToken');
  const clientId = await ctx.brain.getConfig('api.google.clientId');
  const clientSecret = await ctx.brain.getConfig('api.google.clientSecret');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Google API not configured. Please connect Google in the APIs page and enable the Fitness API scope.',
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

// ─── Date Helpers ───────────────────────────────────────────────────────────

export function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Google Fit API Helpers ─────────────────────────────────────────────────

export async function aggregate(
  token: string,
  dataTypes: string[],
  startTime: Date,
  endTime: Date,
  bucketByTime?: { durationMillis: number },
): Promise<any> {
  const body: any = {
    aggregateBy: dataTypes.map((dt) => ({ dataTypeName: dt })),
    startTimeMillis: startTime.getTime(),
    endTimeMillis: endTime.getTime(),
  };

  if (bucketByTime) {
    body.bucketByTime = bucketByTime;
  }

  const res = await fetch(`${FIT_API}/dataset:aggregate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Fit API error: ${err}`);
  }

  return res.json();
}

export async function getSessions(
  token: string,
  startTime: Date,
  endTime: Date,
  activityType?: number,
): Promise<any> {
  const params = new URLSearchParams({
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  });
  if (activityType !== undefined) {
    params.set('activityType', activityType.toString());
  }

  const res = await fetch(`${FIT_API}/sessions?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Fit sessions API error: ${err}`);
  }

  return res.json();
}

// ─── Data Extraction ────────────────────────────────────────────────────────

export function extractAggregateValue(
  bucket: any,
  dataType: string,
): number | null {
  for (const dataset of bucket.dataset || []) {
    if (dataset.dataSourceId?.includes(dataType) || true) {
      for (const point of dataset.point || []) {
        for (const val of point.value || []) {
          if (val.intVal !== undefined) return val.intVal;
          if (val.fpVal !== undefined) return Math.round(val.fpVal * 100) / 100;
        }
      }
    }
  }
  return null;
}

export function extractAllPoints(
  bucket: any,
): Array<{ value: number; time: string }> {
  const points: Array<{ value: number; time: string }> = [];
  for (const dataset of bucket.dataset || []) {
    for (const point of dataset.point || []) {
      const time = new Date(
        parseInt(point.startTimeNanos) / 1_000_000,
      ).toISOString();
      for (const val of point.value || []) {
        const v = val.intVal ?? val.fpVal;
        if (v !== undefined) {
          points.push({ value: Math.round(v * 100) / 100, time });
        }
      }
    }
  }
  return points;
}
