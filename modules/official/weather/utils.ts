import type {
  GeoResult,
  CurrentWeatherResponse,
  ForecastResponse,
} from './types';
import { GEOCODING_URL, WEATHER_URL, WMO_CODES } from './constants';

export function weatherLabel(code: number): string {
  return WMO_CODES[code] ?? `Unknown (${code})`;
}

export async function geocode(location: string): Promise<GeoResult> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.statusText}`);
  }
  const data = (await res.json()) as { results?: GeoResult[] };
  if (!data.results?.length) {
    throw new Error(
      `Location "${location}" not found. Try a more specific name (e.g. "Paris, France").`,
    );
  }
  return data.results[0]!;
}

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  timezone: string,
): Promise<CurrentWeatherResponse> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'precipitation',
      'cloud_cover',
      'pressure_msl',
    ].join(','),
    timezone,
  });

  const res = await fetch(`${WEATHER_URL}?${params}`);
  if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
  return (await res.json()) as CurrentWeatherResponse;
}

export async function fetchForecast(
  lat: number,
  lon: number,
  days: number,
  timezone: string,
): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'weather_code',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'sunrise',
      'sunset',
      'uv_index_max',
    ].join(','),
    timezone,
    forecast_days: days.toString(),
  });

  const res = await fetch(`${WEATHER_URL}?${params}`);
  if (!res.ok) throw new Error(`Weather API error: ${res.statusText}`);
  return (await res.json()) as ForecastResponse;
}
