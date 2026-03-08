import type { ModuleContext } from '../../../../back/utils/brain';
import { GMAIL_API } from '../constants';
import {
  getAccessToken,
  resolveAttachment,
  buildMimeWithAttachments,
} from '../utils';

/**
 * Send an email via Gmail
 */
export async function handleSendEmail(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const accessToken = await getAccessToken(ctx);
  const { to, subject, body, cc, bcc, attachments } = args;

  if (!to || !subject || !body) {
    return 'Error: to, subject, and body are all required.';
  }

  let raw: string;

  if (attachments?.length) {
    const resolved = await Promise.all(
      (attachments as Record<string, any>[]).map(resolveAttachment),
    );
    raw = buildMimeWithAttachments(to, subject, body, resolved, cc, bcc);
  } else {
    const emailLines = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body,
    ];
    raw = emailLines.join('\n');
  }

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await fetch(`${GMAIL_API}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    throw new Error(`Gmail send error: ${err}`);
  }

  const attCount = attachments?.length || 0;
  const attMsg = attCount > 0 ? ` with ${attCount} attachment(s)` : '';
  await ctx.events.emit('email.sent', {
    to,
    subject,
    attachments: attCount,
  });
  return `Email sent to ${to} with subject "${subject}"${attMsg}.`;
}
