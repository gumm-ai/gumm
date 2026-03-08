/**
 * POST /api/auth/login
 *
 * Simple password-based auth for Gumm.
 */
import { applyRateLimit, RATE_LIMITS } from '../../utils/rate-limiter';

export default defineEventHandler(async (event) => {
  // Rate-limit auth attempts: 10 tries per 5 minutes
  await applyRateLimit(event, 'auth', RATE_LIMITS.auth);

  const body = await readBody<{ password: string }>(event);

  if (!body?.password) {
    throw createError({ statusCode: 401, message: 'Invalid password' });
  }

  const brain = useBrain();
  await brain.ready();
  const storedHash = await brain.getConfig('admin.passwordHash');

  // No hash means setup is not complete — refuse login entirely
  if (!storedHash) {
    throw createError({
      statusCode: 403,
      message:
        'Setup not complete. Please finish the initial setup before logging in.',
    });
  }

  const valid = await Bun.password.verify(body.password, storedHash);

  if (!valid) {
    throw createError({ statusCode: 401, message: 'Invalid password' });
  }

  await setUserSession(event, {
    user: {
      name: 'Admin',
    },
  });

  return { ok: true };
});
