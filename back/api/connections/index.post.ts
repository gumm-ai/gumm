/**
 * POST /api/connections
 *
 * Create a new API connection.
 * Body: { id, name, provider, authType, config }
 */
import { apiConnections } from '../../db/schema';
import { encryptConfig } from '../../utils/connection-crypto';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const body = await readBody<{
    id: string;
    name: string;
    provider: string;
    authType: 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'none';
    config: Record<string, string>;
  }>(event);

  if (!body?.id?.trim() || !body?.name?.trim() || !body?.provider?.trim()) {
    throw createError({
      statusCode: 400,
      message: 'id, name, and provider are required',
    });
  }

  // Validate id format (kebab-case)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.id.trim())) {
    throw createError({
      statusCode: 400,
      message: 'id must be kebab-case (e.g. "google-main")',
    });
  }

  const validAuthTypes = ['oauth2', 'api_key', 'bearer', 'basic', 'none'];
  const authType = body.authType || 'api_key';
  if (!validAuthTypes.includes(authType)) {
    throw createError({
      statusCode: 400,
      message: `authType must be one of: ${validAuthTypes.join(', ')}`,
    });
  }

  const now = new Date();

  try {
    await useDrizzle()
      .insert(apiConnections)
      .values({
        id: body.id.trim(),
        name: body.name.trim(),
        provider: body.provider.trim(),
        authType,
        config: encryptConfig(body.config || {}),
        status: 'disconnected',
        createdAt: now,
        updatedAt: now,
      });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      throw createError({
        statusCode: 409,
        message: `Connection "${body.id}" already exists`,
      });
    }
    throw err;
  }

  return { ok: true, id: body.id.trim() };
});
