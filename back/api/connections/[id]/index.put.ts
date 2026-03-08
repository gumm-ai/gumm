/**
 * PUT /api/connections/:id
 *
 * Update an existing API connection.
 * Body: { name?, provider?, authType?, config? }
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../../db/schema';
import { encryptConfig, decryptConfig } from '../../../utils/connection-crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Connection ID required' });
  }

  const [existing] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, id));

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Connection not found' });
  }

  const body = await readBody<{
    name?: string;
    provider?: string;
    authType?: 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'none';
    config?: Record<string, string>;
    status?: 'connected' | 'disconnected' | 'error';
  }>(event);

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (body?.name?.trim()) updates.name = body.name.trim();
  if (body?.provider?.trim()) updates.provider = body.provider.trim();
  if (body?.authType) {
    const validAuthTypes = ['oauth2', 'api_key', 'bearer', 'basic', 'none'];
    if (!validAuthTypes.includes(body.authType)) {
      throw createError({
        statusCode: 400,
        message: `authType must be one of: ${validAuthTypes.join(', ')}`,
      });
    }
    updates.authType = body.authType;
  }
  if (body?.config) {
    // Decrypt existing config, merge, then re-encrypt
    const existingConfig = decryptConfig(existing.config);
    updates.config = encryptConfig({ ...existingConfig, ...body.config });
  }
  if (body?.status) updates.status = body.status;

  await useDrizzle()
    .update(apiConnections)
    .set(updates)
    .where(eq(apiConnections.id, id));

  return { ok: true, id };
});
