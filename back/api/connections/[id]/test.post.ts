/**
 * POST /api/connections/:id/test
 *
 * Test an API connection by attempting a lightweight request.
 * Updates the connection status based on the result.
 */
import { eq } from 'drizzle-orm';
import { apiConnections } from '../../../db/schema';
import { decryptConfig } from '../../../utils/connection-crypto';

/** Provider-specific test endpoints */
const TEST_URLS: Record<
  string,
  {
    url: string;
    headers: (config: Record<string, string>) => Record<string, string>;
  }
> = {
  google: {
    url: 'https://www.googleapis.com/oauth2/v1/tokeninfo',
    headers: (c) => ({
      Authorization: `Bearer ${c.accessToken || c.apiKey || ''}`,
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey || ''}` }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (c) => ({
      'x-api-key': c.apiKey || '',
      'anthropic-version': '2023-06-01',
    }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    headers: (c) => ({ Authorization: `Bearer ${c.apiKey || ''}` }),
  },
};

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, message: 'Connection ID required' });
  }

  const [row] = await useDrizzle()
    .select()
    .from(apiConnections)
    .where(eq(apiConnections.id, id));

  if (!row) {
    throw createError({ statusCode: 404, message: 'Connection not found' });
  }

  let config: Record<string, string> = {};
  try {
    config = decryptConfig(row.config);
  } catch {}

  let success = false;
  let errorMsg = '';

  const testSpec = TEST_URLS[row.provider];

  if (testSpec) {
    // Known provider — use predefined test
    try {
      const res = await fetch(testSpec.url, {
        method: 'GET',
        headers: testSpec.headers(config),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        success = true;
      } else {
        const body = await res.text().catch(() => '');
        errorMsg = `HTTP ${res.status}: ${body.slice(0, 200)}`;
      }
    } catch (err: any) {
      errorMsg = err.message || 'Connection failed';
    }
  } else if (config.testUrl) {
    // Custom provider with user-defined test URL
    try {
      const headers: Record<string, string> = {};
      if (row.authType === 'bearer' && config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      } else if (
        row.authType === 'api_key' &&
        config.apiKey &&
        config.headerName
      ) {
        headers[config.headerName] = config.apiKey;
      }
      const res = await fetch(config.testUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      success = res.ok;
      if (!success) {
        errorMsg = `HTTP ${res.status}`;
      }
    } catch (err: any) {
      errorMsg = err.message || 'Connection failed';
    }
  } else {
    // No test available — just check that config has values
    const hasValues = Object.values(config).some((v) => v && v.trim());
    success = hasValues;
    if (!success) errorMsg = 'No credentials configured';
  }

  const now = new Date();
  await useDrizzle()
    .update(apiConnections)
    .set({
      status: success ? 'connected' : 'error',
      error: success ? null : errorMsg,
      lastTestedAt: now,
      updatedAt: now,
    })
    .where(eq(apiConnections.id, id));

  return {
    ok: success,
    status: success ? 'connected' : 'error',
    error: success ? null : errorMsg,
  };
});
