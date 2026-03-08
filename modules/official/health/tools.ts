import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'health_daily_summary',
        description:
          'Get a daily health summary: steps, calories burned, distance walked, and active minutes. Defaults to today if no date provided.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format. Defaults to today.',
            },
            days: {
              type: 'number',
              description:
                'Number of days to include (going back from date). Defaults to 1.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'health_sleep',
        description:
          'Get sleep data including duration, sleep stages (light, deep, REM), and quality. Defaults to last night.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description:
                "Date in YYYY-MM-DD format. Shows sleep ending on this date (i.e. last night's sleep). Defaults to today.",
            },
            days: {
              type: 'number',
              description:
                'Number of days of sleep data to fetch. Defaults to 1.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'health_heart_rate',
        description:
          'Get heart rate measurements including min, max, average, and resting heart rate.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format. Defaults to today.',
            },
            days: {
              type: 'number',
              description:
                'Number of days to include. Defaults to 1. Use 7 for a week overview.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'health_body_metrics',
        description:
          'Get body metrics: weight, height, BMI, and body fat percentage. Returns the most recent measurements.',
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description:
                'How many days back to look for measurements. Defaults to 30.',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'health_workouts',
        description:
          'Get recent workout sessions (exercise, running, cycling, gym, etc.) with duration and calories.',
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description:
                'Number of days to look back for workouts. Defaults to 7.',
            },
          },
          required: [],
        },
      },
    },
  ];
}
