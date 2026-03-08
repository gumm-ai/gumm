import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'calendar_list_events',
        description:
          'List upcoming events from Google Calendar. Defaults to the next 7 days on the primary calendar.',
        parameters: {
          type: 'object',
          properties: {
            timeMin: {
              type: 'string',
              description:
                'Start of the time range in ISO 8601 format (e.g. "2025-03-06T00:00:00Z"). Defaults to now.',
            },
            timeMax: {
              type: 'string',
              description:
                'End of the time range in ISO 8601 format. Defaults to 7 days from now.',
            },
            maxResults: {
              type: 'number',
              description:
                'Maximum number of events to return (default: 20, max: 50).',
            },
            calendarId: {
              type: 'string',
              description: 'Calendar ID (default: "primary").',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_create_event',
        description:
          'Create a new event in Google Calendar. The start and end times must be ISO 8601. For all-day events, use date format "YYYY-MM-DD" instead of full datetime.',
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Event title.',
            },
            start: {
              type: 'string',
              description:
                'Start time in ISO 8601 (e.g. "2025-03-07T14:00:00+01:00") or date for all-day events ("2025-03-07").',
            },
            end: {
              type: 'string',
              description:
                'End time in ISO 8601 or date for all-day events. If omitted, defaults to 1 hour after start.',
            },
            description: {
              type: 'string',
              description: 'Event description/notes.',
            },
            location: {
              type: 'string',
              description: 'Event location.',
            },
            attendees: {
              type: 'string',
              description: 'Comma-separated list of attendee email addresses.',
            },
            calendarId: {
              type: 'string',
              description: 'Calendar ID (default: "primary").',
            },
          },
          required: ['summary', 'start'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_update_event',
        description:
          'Update an existing Google Calendar event. Only provided fields will be changed.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'The event ID to update.',
            },
            summary: {
              type: 'string',
              description: 'New event title.',
            },
            start: {
              type: 'string',
              description: 'New start time in ISO 8601.',
            },
            end: {
              type: 'string',
              description: 'New end time in ISO 8601.',
            },
            description: {
              type: 'string',
              description: 'New event description.',
            },
            location: {
              type: 'string',
              description: 'New event location.',
            },
            calendarId: {
              type: 'string',
              description: 'Calendar ID (default: "primary").',
            },
          },
          required: ['eventId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_delete_event',
        description: 'Delete an event from Google Calendar by its event ID.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'The event ID to delete.',
            },
            calendarId: {
              type: 'string',
              description: 'Calendar ID (default: "primary").',
            },
          },
          required: ['eventId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'calendar_check_availability',
        description:
          'Check free/busy status for a time range. Returns busy slots and available windows.',
        parameters: {
          type: 'object',
          properties: {
            timeMin: {
              type: 'string',
              description: 'Start of range in ISO 8601. Defaults to now.',
            },
            timeMax: {
              type: 'string',
              description:
                'End of range in ISO 8601. Defaults to end of today.',
            },
            calendarId: {
              type: 'string',
              description: 'Calendar ID (default: "primary").',
            },
          },
          required: [],
        },
      },
    },
  ];
}
