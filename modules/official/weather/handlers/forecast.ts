import { geocode, fetchForecast, weatherLabel } from '../utils';

export async function handleForecast(
  location: string,
  days: number,
): Promise<string> {
  const geo = await geocode(location);
  const displayName = geo.admin1
    ? `${geo.name}, ${geo.admin1}, ${geo.country}`
    : `${geo.name}, ${geo.country}`;

  const clampedDays = Math.min(14, Math.max(1, days || 5));
  const data = await fetchForecast(
    geo.latitude,
    geo.longitude,
    clampedDays,
    geo.timezone,
  );
  const d = data.daily;

  const forecast = d.time.map((date, i) => ({
    date,
    conditions: weatherLabel(d.weather_code[i]!),
    temp_high: `${d.temperature_2m_max[i]}°C`,
    temp_low: `${d.temperature_2m_min[i]}°C`,
    precipitation: `${d.precipitation_sum[i]} mm`,
    rain_probability: `${d.precipitation_probability_max[i]}%`,
    wind_max: `${d.wind_speed_10m_max[i]} km/h`,
    uv_index: d.uv_index_max[i],
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
  }));

  return JSON.stringify({ location: displayName, forecast }, null, 2);
}
