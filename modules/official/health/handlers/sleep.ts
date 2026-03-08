import { DATA_TYPES, SLEEP_STAGES } from '../constants';
import { parseDate, endOfDay, aggregate } from '../utils';

/**
 * Get sleep data
 */
export async function handleSleep(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const days = args.days || 1;
  const endDate = args.date
    ? endOfDay(parseDate(args.date))
    : endOfDay(new Date());
  // Sleep starts the evening before, so extend the start window
  const startDate = new Date(endDate.getTime() - days * 86_400_000);
  startDate.setHours(18, 0, 0, 0);

  const data = await aggregate(token, [DATA_TYPES.sleep], startDate, endDate);

  const segments: Array<{
    stage: string;
    start: string;
    end: string;
    duration_min: number;
  }> = [];
  let totalSleepMs = 0;
  const stageDurations: Record<string, number> = {};

  for (const bucket of data.bucket || []) {
    for (const dataset of bucket.dataset || []) {
      for (const point of dataset.point || []) {
        const startMs = parseInt(point.startTimeNanos) / 1_000_000;
        const endMs = parseInt(point.endTimeNanos) / 1_000_000;
        const durationMs = endMs - startMs;
        const stageCode = point.value?.[0]?.intVal ?? 0;
        const stageName = SLEEP_STAGES[stageCode] || `Stage ${stageCode}`;

        // Only count actual sleep stages (not awake/out of bed)
        if (stageCode !== 1 && stageCode !== 3) {
          totalSleepMs += durationMs;
        }
        stageDurations[stageName] =
          (stageDurations[stageName] || 0) + durationMs;

        segments.push({
          stage: stageName,
          start: new Date(startMs).toISOString(),
          end: new Date(endMs).toISOString(),
          duration_min: Math.round(durationMs / 60_000),
        });
      }
    }
  }

  const totalHours = Math.round((totalSleepMs / 3_600_000) * 100) / 100;
  const stageBreakdown: Record<string, number> = {};
  for (const [stage, ms] of Object.entries(stageDurations)) {
    stageBreakdown[stage] = Math.round(ms / 60_000);
  }

  return JSON.stringify({
    total_sleep_hours: totalHours,
    stage_breakdown_minutes: stageBreakdown,
    segments: segments.slice(0, 50), // Limit for LLM context
  });
}
