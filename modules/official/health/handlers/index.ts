import { handleDailySummary } from './daily';
import { handleSleep } from './sleep';
import { handleHeartRate } from './heart-rate';
import { handleBodyMetrics } from './body';
import { handleWorkouts } from './workouts';

export {
  handleDailySummary,
  handleSleep,
  handleHeartRate,
  handleBodyMetrics,
  handleWorkouts,
};

/**
 * Main handler router for Health module
 */
export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  token: string,
): Promise<string> {
  switch (toolName) {
    case 'health_daily_summary':
      return handleDailySummary(token, args);
    case 'health_sleep':
      return handleSleep(token, args);
    case 'health_heart_rate':
      return handleHeartRate(token, args);
    case 'health_body_metrics':
      return handleBodyMetrics(token, args);
    case 'health_workouts':
      return handleWorkouts(token, args);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
