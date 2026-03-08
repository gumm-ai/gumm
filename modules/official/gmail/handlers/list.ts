import type { ModuleContext } from '../../../../back/utils/brain';
import { GMAIL_API } from '../constants';
import { getAccessToken, getHeader } from '../utils';

/**
 * List or search recent emails in Gmail
 */
export async function handleListEmails(
  ctx: ModuleContext,
  args: Record<string, any>,
): Promise<string> {
  const accessToken = await getAccessToken(ctx);
  const maxResults = Math.min(Number(args.maxResults) || 10, 50);
  const q = args.query || '';

  const params = new URLSearchParams({
    maxResults: String(maxResults),
    ...(q ? { q } : {}),
  });

  const listRes = await fetch(`${GMAIL_API}/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(`Gmail API error: ${err}`);
  }

  const listData = (await listRes.json()) as {
    messages?: Array<{ id: string }>;
  };
  const messageIds = listData.messages || [];

  if (messageIds.length === 0) {
    return q ? `No emails found matching "${q}".` : 'No emails found.';
  }

  // Fetch metadata for each message in parallel
  const metaRequests = messageIds.slice(0, maxResults).map((m) =>
    fetch(
      `${GMAIL_API}/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    ).then((r) => r.json()),
  );

  const metas = (await Promise.all(metaRequests)) as any[];
  const lines = metas.map((m) => {
    const headers = m.payload?.headers || [];
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject');
    const date = getHeader(headers, 'Date');
    return `[${m.id}] ${date} | From: ${from} | Subject: ${subject}`;
  });

  return `Found ${lines.length} email(s):\n\n${lines.join('\n')}`;
}
