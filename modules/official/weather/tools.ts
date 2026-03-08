import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'weather_current',
        description:
          'Get the current weather conditions for a location. Returns temperature, humidity, wind, precipitation, and conditions.',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'City name, optionally with country (e.g. "Paris", "London, UK", "Tokyo, Japan")',
            },
          },
          required: ['location'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'weather_forecast',
        description:
          'Get the weather forecast for a location over the next few days. Returns daily high/low temperatures, conditions, rain probability, wind, UV index, and sunrise/sunset.',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'City name, optionally with country (e.g. "Paris", "London, UK", "Tokyo, Japan")',
            },
            days: {
              type: 'number',
              description: 'Number of forecast days (1-14). Defaults to 5.',
            },
          },
          required: ['location'],
        },
      },
    },
  ];
}
