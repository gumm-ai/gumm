/**
 * POST /api/storage/upload
 *
 * Proxy file upload to the primary storage node.
 * If no storage node is configured, falls back to local storage.
 */
import { storageNodes } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { storageSet } from '../../utils/storage';
import { randomUUID } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const db = useDrizzle();

  // Find primary online storage node
  const primary = await db
    .select()
    .from(storageNodes)
    .where(eq(storageNodes.role, 'primary'))
    .get();

  // Read multipart form data
  const formData = await readMultipartFormData(event);
  if (!formData?.length) {
    throw createError({ statusCode: 400, message: 'No file provided' });
  }

  const file = formData[0] as { filename?: string; data: Buffer };
  const filename = file.filename || `upload-${randomUUID()}`;
  const storageKey = `files/${Date.now()}-${filename}`;

  // If a primary storage node is online, proxy the upload
  if (primary && primary.status === 'online') {
    try {
      const formBody = new FormData();
      formBody.append(
        'file',
        new Blob([
          file.data.buffer.slice(
            file.data.byteOffset,
            file.data.byteOffset + file.data.byteLength,
          ) as ArrayBuffer,
        ]),
        filename,
      );
      formBody.append('key', storageKey);

      const resp = await fetch(`${primary.url}/storage/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${primary.token}` },
        body: formBody,
      });

      if (resp.ok) {
        return { storageKey, node: primary.name, remote: true };
      }
      // Fall through to local storage on failure
    } catch {
      // Remote node unreachable, fall back to local
    }
  }

  // Fallback: store locally
  await storageSet(storageKey, file.data);
  return { storageKey, remote: false };
});
