import type { ModuleContext } from '../../../../back/utils/brain';
import { GMAIL_API } from '../constants';
import {
  getAccessToken,
  getHeader,
  extractBody,
  extractAttachments,
} from '../utils';

/**
 * Read the full content of a specific email
 */
export async function handleReadEmail(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const accessToken = await getAccessToken(ctx);
  const { messageId } = args;

  if (!messageId) return 'Error: messageId is required.';

  const msgRes = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!msgRes.ok) {
    const err = await msgRes.text();
    throw new Error(`Gmail API error: ${err}`);
  }

  const msg = (await msgRes.json()) as any;
  const headers = msg.payload?.headers || [];
  const from = getHeader(headers, 'From');
  const to = getHeader(headers, 'To');
  const subject = getHeader(headers, 'Subject');
  const date = getHeader(headers, 'Date');
  const body = extractBody(msg.payload).trim();

  const attachments = extractAttachments(msg.payload);
  const attachmentLines =
    attachments.length > 0
      ? [
          '',
          `Attachments (${attachments.length}):`,
          ...attachments.map(
            (a) =>
              `  - "${a.filename}" (${a.mimeType}, ${Math.round(a.size / 1024)} KB) [attachmentId: ${a.attachmentId}]`,
          ),
        ]
      : [];

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Date: ${date}`,
    `Subject: ${subject}`,
    '',
    body || '(no plain text body)',
    ...attachmentLines,
  ].join('\n');
}
