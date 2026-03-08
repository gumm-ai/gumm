import { startOfDay, endOfDay, daysAgo, getSessions } from '../utils';

/**
 * Get recent workout sessions
 */
export async function handleWorkouts(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const days = args.days || 7;
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(daysAgo(days));

  const data = await getSessions(token, startDate, endDate);

  const workouts = (data.session || [])
    .filter((s: any) => {
      // Filter out sleep sessions (activity type 72) and unknown (0)
      const type = s.activityType;
      return type !== 72 && type !== 0;
    })
    .map((s: any) => {
      const startMs = parseInt(s.startTimeMillis);
      const endMs = parseInt(s.endTimeMillis);
      const durationMin = Math.round((endMs - startMs) / 60_000);

      return {
        name: s.name || s.description || 'Workout',
        activity_type: s.activityType,
        start: new Date(startMs).toISOString(),
        duration_minutes: durationMin,
        description: s.description || undefined,
      };
    })
    .slice(0, 30); // Limit for LLM context

  if (workouts.length === 0) {
    return JSON.stringify({
      message: `No workouts recorded in the last ${days} days.`,
    });
  }

  return JSON.stringify(workouts);
}
