/**
 * PUT /api/auth/password
 *
 * Change the admin password. Requires the current password for verification.
 */
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const body = await readBody<{
    currentPassword: string;
    newPassword: string;
  }>(event);

  if (!body?.currentPassword || !body?.newPassword) {
    throw createError({
      statusCode: 400,
      message: 'Current and new password are required',
    });
  }

  if (body.newPassword.trim().length < 12) {
    throw createError({
      statusCode: 400,
      message: 'Password must be at least 12 characters',
    });
  }

  const brain = useBrain();
  await brain.ready();

  // Verify current password — setup must be complete before a password change
  const storedHash = await brain.getConfig('admin.passwordHash');
  if (!storedHash) {
    throw createError({
      statusCode: 403,
      message: 'No password has been set yet. Complete setup first.',
    });
  }

  const currentValid = await Bun.password.verify(
    body.currentPassword,
    storedHash,
  );

  if (!currentValid) {
    throw createError({
      statusCode: 401,
      message: 'Current password is incorrect',
    });
  }

  // Hash and store new password
  const newHash = await Bun.password.hash(body.newPassword, {
    algorithm: 'bcrypt',
    cost: 10,
  });
  await brain.setConfig('admin.passwordHash', newHash);

  return { ok: true };
});
