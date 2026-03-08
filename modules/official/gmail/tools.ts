import type { ToolDefinition } from '../../../back/utils/module-types';

export function tools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'gmail_list_emails',
        description:
          'List or search recent emails in Gmail. Use a Gmail search query to filter results (e.g. "is:unread", "from:boss@company.com", "subject:invoice").',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Gmail search query (e.g. "is:unread", "from:john@example.com"). Leave empty to list recent emails.',
            },
            maxResults: {
              type: 'number',
              description:
                'Maximum number of emails to return (default: 10, max: 50).',
            },
          },
          required: [],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gmail_read_email',
        description:
          'Read the full content of a specific email by its ID. Also lists any attachments found (with attachmentId for downloading).',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'The Gmail message ID to read.',
            },
          },
          required: ['messageId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gmail_send_email',
        description:
          'Send an email via Gmail, optionally with file attachments. Attachments can be provided by public URL or by a storageKey referencing a file previously saved in Gumm storage.',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address.',
            },
            cc: {
              type: 'string',
              description: 'CC email address(es), comma-separated. Optional.',
            },
            bcc: {
              type: 'string',
              description: 'BCC email address(es), comma-separated. Optional.',
            },
            subject: {
              type: 'string',
              description: 'Email subject.',
            },
            body: {
              type: 'string',
              description: 'Plain text email body.',
            },
            attachments: {
              type: 'array',
              description: 'File attachments to include in the email.',
              items: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description:
                      'Public URL to fetch the file from (mutually exclusive with storageKey).',
                  },
                  storageKey: {
                    type: 'string',
                    description:
                      'Key of a file in Gumm storage, e.g. from gmail_get_attachment (mutually exclusive with url).',
                  },
                  filename: {
                    type: 'string',
                    description:
                      'Filename for the attachment (auto-detected if omitted).',
                  },
                  mimeType: {
                    type: 'string',
                    description: 'MIME type (auto-detected if omitted).',
                  },
                },
              },
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'gmail_get_attachment',
        description:
          'Download an attachment from a Gmail email and save it to Gumm storage. Returns a storageKey that can be used to forward the attachment via gmail_send_email.',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'The Gmail message ID containing the attachment.',
            },
            attachmentId: {
              type: 'string',
              description: 'The attachment ID (from gmail_read_email output).',
            },
            filename: {
              type: 'string',
              description: 'Filename to save the attachment as.',
            },
          },
          required: ['messageId', 'attachmentId'],
        },
      },
    },
  ];
}
