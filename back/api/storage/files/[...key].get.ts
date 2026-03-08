/**
 * GET /api/storage/files/:key
 *
 * Retrieve a file from the primary storage node, with local fallback.
 */
import { storageNodes } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { storageGet } from '../../../utils/storage';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const key = getRouterParam(event, 'key');
  if (!key) {
    throw createError({ statusCode: 400, message: 'File key required' });
  }

  // Reconstruct full key from route (Nitro catch-all)
  const url = getRequestURL(event);
  const fullKey = url.pathname.replace('/api/storage/files/', '');

  const db = useDrizzle();

  // Try primary storage node
  const primary = await db
    .select()
    .from(storageNodes)
    .where(eq(storageNodes.role, 'primary'))
    .get();

  if (primary && primary.status === 'online') {
    try {
      const resp = await fetch(`${primary.url}/storage/files/${fullKey}`, {
        headers: { Authorization: `Bearer ${primary.token}` },
      });

      if (resp.ok) {
        const data = await resp.arrayBuffer();
        setHeader(
          event,
          'Content-Type',
          resp.headers.get('content-type') || 'application/octet-stream',
        );
        return Buffer.from(data);
      }
    } catch {
      // Fall through to local
    }
  }

  // Fallback: local storage
  const data = await storageGet(fullKey);
  if (!data) {
    throw createError({ statusCode: 404, message: 'File not found' });
  }

  setHeader(event, 'Content-Type', 'application/octet-stream');
  return data;
});
