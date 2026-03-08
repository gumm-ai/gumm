/**
 * POST /api/storage/heartbeat
 *
 * Called by storage nodes to report status.
 * Auth: Bearer token (the node's token).
 * Body: { totalBytes, usedBytes }
 */
import { storageNodes } from '../../db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw createError({ statusCode: 401, message: 'Bearer token required' });
  }

  const token = auth.slice(7);
  const db = useDrizzle();

  const node = await db
    .select()
    .from(storageNodes)
    .where(eq(storageNodes.token, token))
    .get();

  if (!node) {
    throw createError({ statusCode: 401, message: 'Invalid storage token' });
  }

  const body = await readBody<{
    totalBytes?: number;
    usedBytes?: number;
  }>(event);

  const now = new Date();
  await db
    .update(storageNodes)
    .set({
      status: 'online',
      totalBytes: body?.totalBytes ?? node.totalBytes,
      usedBytes: body?.usedBytes ?? node.usedBytes,
      lastSeenAt: now,
      error: null,
      updatedAt: now,
    })
    .where(eq(storageNodes.id, node.id));

  return { ok: true, nodeId: node.id };
});
