import type { ModuleContext } from '../../../../back/utils/brain';
import { storageSet } from '../../../../back/utils/storage';
import { GMAIL_API } from '../constants';
import { getAccessToken } from '../utils';

/**
 * Download an attachment and save it to storage
 */
export async function handleGetAttachment(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const accessToken = await getAccessToken(ctx);
  const { messageId, attachmentId, filename } = args;

  if (!messageId || !attachmentId) {
    return 'Error: messageId and attachmentId are required.';
  }

  const attRes = await fetch(
    `${GMAIL_API}/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!attRes.ok) {
    const err = await attRes.text();
    throw new Error(`Gmail attachment error: ${err}`);
  }

  const attData = (await attRes.json()) as { data: string; size: number };
  const buffer = Buffer.from(
    attData.data.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  );

  const safeName = (filename || attachmentId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey = `attachments/gmail/${messageId}/${safeName}`;
  await storageSet(storageKey, buffer);

  return `Attachment "${safeName}" downloaded (${Math.round(buffer.length / 1024)} KB) and saved to storage. Use storageKey "${storageKey}" to forward it via gmail_send_email.`;
}
