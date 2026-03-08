import { DATA_TYPES } from '../constants';
import {
  parseDate,
  startOfDay,
  endOfDay,
  aggregate,
  extractAggregateValue,
} from '../utils';

/**
 * Get a daily health summary
 */
export async function handleDailySummary(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const days = args.days || 1;
  const endDate = args.date
    ? endOfDay(parseDate(args.date))
    : endOfDay(new Date());
  const startDate = startOfDay(
    new Date(endDate.getTime() - (days - 1) * 86_400_000),
  );

  const data = await aggregate(
    token,
    [
      DATA_TYPES.steps,
      DATA_TYPES.calories,
      DATA_TYPES.distance,
      DATA_TYPES.activeMinutes,
    ],
    startDate,
    endDate,
    { durationMillis: 86_400_000 },
  );

  const results = (data.bucket || []).map((bucket: any) => {
    const date = new Date(parseInt(bucket.startTimeMillis))
      .toISOString()
      .split('T')[0];
    const steps = extractAggregateValue(bucket, DATA_TYPES.steps);
    const calories = extractAggregateValue(bucket, DATA_TYPES.calories);
    const distanceM = extractAggregateValue(bucket, DATA_TYPES.distance);
    const activeMin = extractAggregateValue(bucket, DATA_TYPES.activeMinutes);

    return {
      date,
      steps: steps ?? 0,
      calories_burned: calories ? Math.round(calories) : 0,
      distance_km: distanceM ? Math.round((distanceM / 1000) * 100) / 100 : 0,
      active_minutes: activeMin ?? 0,
    };
  });

  return JSON.stringify(results.length === 1 ? results[0] : results);
}
