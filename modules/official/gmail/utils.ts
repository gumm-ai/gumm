import type { ModuleContext } from '../../../back/utils/brain';
import { storageGet } from '../../../back/utils/storage';
import { TOKEN_URL, MAX_ATTACHMENT_SIZE, MIME_TYPE_MAP } from './constants';
import type { ResolvedAttachment, AttachmentInfo } from './types';

// ─── Auth Utilities ─────────────────────────────────────────────────────────

/**
 * Refresh the Gmail access token using the stored refresh token
 */
export async function getAccessToken(ctx: ModuleContext): Promise<string> {
  const refreshToken = await ctx.brain.getConfig('api.google.refreshToken');
  const clientId = await ctx.brain.getConfig('api.google.clientId');
  const clientSecret = await ctx.brain.getConfig('api.google.clientSecret');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Google API not configured. Please connect Google in the APIs page and complete OAuth.',
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh Gmail access token: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ─── Security Utilities ─────────────────────────────────────────────────────

/**
 * SSRF protection: reject URLs pointing to internal/private networks
 */
export function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(h))
      return false;
    const parts = h.split('.').map(Number);
    const p0 = parts[0] ?? 0;
    const p1 = parts[1] ?? 0;
    if (p0 === 10) return false;
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return false;
    if (p0 === 192 && p1 === 168) return false;
    if (p0 === 169 && p1 === 254) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── MIME Utilities ─────────────────────────────────────────────────────────

/**
 * Guess MIME type from a filename extension
 */
export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

/**
 * Resolve an attachment from a URL or Gumm storage key
 */
export async function resolveAttachment(
  att: Record<string, any>,
): Promise<ResolvedAttachment> {
  const { url, storageKey, filename, mimeType } = att;

  if (url) {
    if (!isUrlSafe(url)) throw new Error(`URL blocked for security: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_ATTACHMENT_SIZE)
      throw new Error('Attachment too large (max 20 MB).');
    const name =
      filename || new URL(url).pathname.split('/').pop() || 'attachment';
    return {
      filename: name,
      mimeType:
        mimeType ||
        res.headers.get('content-type')?.split(';')[0] ||
        guessMimeType(name),
      content: buffer,
    };
  }

  if (storageKey) {
    const content = await storageGet(storageKey);
    if (!content) throw new Error(`File not found in storage: ${storageKey}`);
    const name = filename || storageKey.split('/').pop() || 'attachment';
    return {
      filename: name,
      mimeType: mimeType || guessMimeType(name),
      content,
    };
  }

  throw new Error('Each attachment must have either "url" or "storageKey".');
}

/**
 * Build a multipart/mixed MIME message with attachments
 */
export function buildMimeWithAttachments(
  to: string,
  subject: string,
  body: string,
  attachments: ResolvedAttachment[],
  cc?: string,
  bcc?: string,
): string {
  const boundary = `gumm_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const lines: string[] = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];

  for (const att of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      att.content.toString('base64'),
    );
  }

  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

// ─── Message Parsing Utilities ──────────────────────────────────────────────

/**
 * Extract attachment metadata from a Gmail message payload
 */
export function extractAttachments(payload: any): AttachmentInfo[] {
  const results: AttachmentInfo[] = [];

  function walk(parts: any[]) {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        results.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || 'application/octet-stream',
          size: part.body.size || 0,
        });
      }
      if (part.parts) walk(part.parts);
    }
  }

  if (payload?.parts) walk(payload.parts);
  return results;
}

/**
 * Decode a base64url-encoded Gmail message part
 */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Extract plain text from a Gmail message payload
 */
export function extractBody(payload: any): string {
  if (!payload) return '';

  // Single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multi-part: find text/plain part
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback: first part with data
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return '';
}

/**
 * Get a header value from a Gmail message payload
 */
export function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string,
): string {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ''
  );
}
