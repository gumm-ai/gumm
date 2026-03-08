/**
 * Weather module — uses Open-Meteo (free, no API key required).
 *
 * Tools:
 *   - weather_current: current conditions for a location
 *   - weather_forecast: multi-day forecast for a location
 *
 * Geocoding is handled automatically via the Open-Meteo geocoding API.
 */

export { tools } from './tools';
import { routeHandler } from './handlers';

export async function handler(
  toolName: string,
  args: Record<string, any>,
): Promise<string> {
  try {
    return await routeHandler(toolName, args);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
