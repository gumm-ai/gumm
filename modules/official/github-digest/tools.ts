import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'github_notifications',
        description:
          'List your GitHub notifications (unread by default). Includes mentions, review requests, CI results, etc.',
        parameters: {
          type: 'object',
          properties: {
            all: {
              type: 'boolean',
              description:
                'If true, show all notifications (not just unread). Default: false.',
            },
            maxResults: {
              type: 'number',
              description:
                'Maximum notifications to return (default: 20, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_pull_requests',
        description:
          'List pull requests relevant to you: authored by you, or where your review is requested. Can also list PRs for a specific repository.',
        parameters: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description:
                'Filter type: "authored" (PRs you created), "review-requested" (PRs needing your review), or "all" (both). Default: "all".',
              enum: ['authored', 'review-requested', 'all'],
            },
            state: {
              type: 'string',
              description:
                'PR state: "open", "closed", or "all". Default: "open".',
              enum: ['open', 'closed', 'all'],
            },
            repo: {
              type: 'string',
              description:
                'Optional: filter to a specific repo ("owner/repo"). If omitted, searches across all repos.',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum PRs to return (default: 15, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_issues',
        description:
          'List GitHub issues assigned to you, or issues in a specific repository.',
        parameters: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              description:
                'Issue state: "open", "closed", or "all". Default: "open".',
              enum: ['open', 'closed', 'all'],
            },
            repo: {
              type: 'string',
              description:
                'Optional: filter to a specific repo ("owner/repo"). If omitted, lists issues assigned to you across all repos.',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum issues to return (default: 15, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_repo_activity',
        description:
          'Get recent activity (events) for a specific GitHub repository: pushes, PRs, issues, releases, etc.',
        parameters: {
          type: 'object',
          properties: {
            repo: {
              type: 'string',
              description: 'Repository in "owner/repo" format.',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum events to return (default: 15, max: 50).',
            },
          },
          required: ['repo'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'github_starred',
        description: 'List your recently starred GitHub repositories.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Maximum repos to return (default: 15, max: 50).',
            },
          },
          required: [],
        },
      },
    },
  ];
}
