import { DATA_TYPES } from '../constants';
import { startOfDay, endOfDay, daysAgo, aggregate } from '../utils';

/**
 * Get body metrics (weight, height, BMI, body fat)
 */
export async function handleBodyMetrics(
  token: string,
  args: Record<string, any>,
): Promise<string> {
  const days = args.days || 30;
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(daysAgo(days));

  const data = await aggregate(
    token,
    [DATA_TYPES.weight, DATA_TYPES.height, DATA_TYPES.bodyFat],
    startDate,
    endDate,
  );

  let latestWeight: number | null = null;
  let latestHeight: number | null = null;
  let latestBodyFat: number | null = null;

  for (const bucket of data.bucket || []) {
    for (const dataset of bucket.dataset || []) {
      for (const point of dataset.point || []) {
        const val = point.value?.[0]?.fpVal;
        if (val === undefined) continue;
        const dsId = dataset.dataSourceId || '';
        if (
          dsId.includes('weight') ||
          dataset.dataSourceId?.includes('body.weight')
        ) {
          latestWeight = Math.round(val * 100) / 100;
        } else if (dsId.includes('height')) {
          latestHeight = Math.round(val * 100) / 100;
        } else if (dsId.includes('body.fat')) {
          latestBodyFat = Math.round(val * 100) / 100;
        }
      }
    }
  }

  const result: Record<string, any> = {};
  if (latestWeight !== null) result.weight_kg = latestWeight;
  if (latestHeight !== null) {
    result.height_m = latestHeight;
    if (latestWeight !== null) {
      result.bmi =
        Math.round((latestWeight / (latestHeight * latestHeight)) * 10) / 10;
    }
  }
  if (latestBodyFat !== null) result.body_fat_percent = latestBodyFat;

  if (Object.keys(result).length === 0) {
    return JSON.stringify({
      message: `No body metrics recorded in the last ${days} days.`,
    });
  }

  return JSON.stringify(result);
}
