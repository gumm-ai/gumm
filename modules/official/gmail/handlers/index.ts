import type { ModuleContext } from '../../../../back/utils/brain';
import { handleListEmails } from './list';
import { handleReadEmail } from './read';
import { handleSendEmail } from './send';
import { handleGetAttachment } from './attachment';

export {
  handleListEmails,
  handleReadEmail,
  handleSendEmail,
  handleGetAttachment,
};

/**
 * Main handler router for Gmail module
 */
export async function routeHandler(
  toolName: string,
  args: Record<string, any>,
  ctx: ModuleContext,
): Promise<string> {
  switch (toolName) {
    case 'gmail_list_emails':
      return handleListEmails(ctx, args);
    case 'gmail_read_email':
      return handleReadEmail(ctx, args);
    case 'gmail_send_email':
      return handleSendEmail(ctx, args);
    case 'gmail_get_attachment':
      return handleGetAttachment(ctx, args);
    default:
      return `Unknown tool: ${toolName}`;
  }
}
