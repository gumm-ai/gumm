import { DATA_TYPES } from '../constants';
import {
  parseDate,
  startOfDay,
  endOfDay,
  aggregate,
  extractAllPoints,
} from '../utils';

/**
 * Get heart rate measurements
 */
export async function handleHeartRate(
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
    [DATA_TYPES.heartRate],
    startDate,
    endDate,
    { durationMillis: 86_400_000 },
  );

  const dailyStats = (data.bucket || []).map((bucket: any) => {
    const date = new Date(parseInt(bucket.startTimeMillis))
      .toISOString()
      .split('T')[0];
    const points = extractAllPoints(bucket);
    const values = points.map((p) => p.value).filter((v) => v > 0);

    if (values.length === 0) {
      return { date, message: 'No heart rate data recorded' };
    }

    return {
      date,
      min_bpm: Math.min(...values),
      max_bpm: Math.max(...values),
      avg_bpm: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      measurements: values.length,
    };
  });

  return JSON.stringify(dailyStats.length === 1 ? dailyStats[0] : dailyStats);
}
