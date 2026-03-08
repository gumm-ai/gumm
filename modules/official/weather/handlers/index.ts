import { handleCurrent } from './current';
import { handleForecast } from './forecast';

export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  const location = args.location as string;
  if (!location) return 'Error: location is required.';

  switch (toolName) {
    case 'weather_current':
      return handleCurrent(location);

    case 'weather_forecast':
      return handleForecast(location, args.days);

    default:
      return `Unknown tool: ${toolName}`;
  }
}
