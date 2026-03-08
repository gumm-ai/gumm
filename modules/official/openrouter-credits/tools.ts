import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'openrouter_credits',
        description:
          'Check the current OpenRouter credit balance and recent spending (today, this week, this month). Includes consumption since midnight if a daily snapshot exists.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'openrouter_credits_history',
        description:
          'View credit consumption history from daily snapshots. Shows how many credits were consumed each day over a given period. Useful for tracking spending trends.',
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look back (default: 7)',
            },
          },
          required: [],
        },
      },
    },
  ];
}
