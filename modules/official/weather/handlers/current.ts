import { geocode, fetchCurrentWeather, weatherLabel } from '../utils';

export async function handleCurrent(location: string): Promise<string> {
  const geo = await geocode(location);
  const displayName = geo.admin1
    ? `${geo.name}, ${geo.admin1}, ${geo.country}`
    : `${geo.name}, ${geo.country}`;

  const data = await fetchCurrentWeather(
    geo.latitude,
    geo.longitude,
    geo.timezone,
  );
  const c = data.current;

  return JSON.stringify(
    {
      location: displayName,
      coordinates: { lat: geo.latitude, lon: geo.longitude },
      time: c.time,
      temperature: `${c.temperature_2m}°C`,
      feels_like: `${c.apparent_temperature}°C`,
      humidity: `${c.relative_humidity_2m}%`,
      conditions: weatherLabel(c.weather_code),
      wind: `${c.wind_speed_10m} km/h (${c.wind_direction_10m}°)`,
      precipitation: `${c.precipitation} mm`,
      cloud_cover: `${c.cloud_cover}%`,
      pressure: `${c.pressure_msl} hPa`,
    },
    null,
    2,
  );
}
